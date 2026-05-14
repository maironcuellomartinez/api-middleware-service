import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { OAuthBulkheadGuard } from './oauth-bulkhead.guard';
import { Bulkhead, BulkheadRegistry, BulkheadRejectedError, BulkheadTimeoutError } from '@backendkit-labs/bulkhead';

describe('OAuthBulkheadGuard', () => {
    let guard: OAuthBulkheadGuard;
    let registry: jest.Mocked<BulkheadRegistry>;
    let mockBulkhead: jest.Mocked<Bulkhead>;

    const mockHandler = jest.fn().mockResolvedValue(undefined);
    const MockController = class MockController {};

    const mockExecutionContext = (overrides: Record<string, any> = {}) =>
        ({
            switchToHttp: () => ({
                getRequest: () => overrides.request ?? {},
                getResponse: () => overrides.response ?? {},
                getNext: () => overrides.next ?? jest.fn(),
            }),
            getHandler: () => overrides.handler ?? mockHandler,
            getClass: () => overrides.controller ?? MockController,
        }) as any;

    beforeEach(async () => {
        mockBulkhead = {
            canAccept:    jest.fn(),
            execute:      jest.fn(),
            getMetrics:   jest.fn(),
            resetMetrics: jest.fn(),
        } as any;

        registry = {
            getOrCreate: jest.fn().mockReturnValue(mockBulkhead),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OAuthBulkheadGuard,
                { provide: BulkheadRegistry, useValue: registry },
            ],
        }).compile();

        guard = module.get<OAuthBulkheadGuard>(OAuthBulkheadGuard);
    });

    describe('canActivate', () => {
        it('should execute the handler via bulkhead.execute and return true', async () => {
            const context = mockExecutionContext();

            mockBulkhead.execute.mockImplementation(async (fn: any) => fn());

            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect(registry.getOrCreate).toHaveBeenCalledWith({
                name:               'oauth:token',
                maxConcurrentCalls: 3,
                maxQueueSize:       5,
                queueTimeoutMs:     5000,
                rejectWhenFull:     true,
            });
            expect(mockBulkhead.execute).toHaveBeenCalled();
        });

        it('should call the original handler with request, response and next', async () => {
            const req = { body: {} };
            const res = { status: jest.fn() };
            const next = jest.fn();
            const handler = jest.fn().mockResolvedValue(undefined);
            const context = mockExecutionContext({ request: req, response: res, next, handler });

            mockBulkhead.execute.mockImplementation(async (fn: any) => fn());

            await guard.canActivate(context);

            expect(handler).toHaveBeenCalledWith(req, res, next);
        });

        it('should throw 429 when bulkhead.execute throws BulkheadRejectedError', async () => {
            const context = mockExecutionContext();

            mockBulkhead.execute.mockRejectedValue(new BulkheadRejectedError('Bulkhead is full'));
            mockBulkhead.getMetrics.mockReturnValue({
                activeCalls:        3,
                queuedCalls:        5,
                maxConcurrentCalls: 3,
                maxQueueSize:       5,
                name:               'oauth:token',
                totalCalls:         100,
                successfulCalls:    90,
                failedCalls:        5,
                rejectedCalls:      5,
                timedOutCalls:      0,
                averageDurationMs:  50,
            });

            await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

            try {
                await guard.canActivate(context);
            } catch (e: any) {
                expect(e.getStatus()).toBe(429);
                expect(e.getResponse().message).toBe(
                    'Demasiados intentos de autenticacion. Intente nuevamente en unos segundos.',
                );
            }
        });

        it('should throw 408 when bulkhead.execute throws BulkheadTimeoutError', async () => {
            const context = mockExecutionContext();

            mockBulkhead.execute.mockRejectedValue(new BulkheadTimeoutError('Bulkhead timeout'));

            await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

            try {
                await guard.canActivate(context);
            } catch (e: any) {
                expect(e.getStatus()).toBe(408);
                expect(e.getResponse().message).toBe(
                    'El servidor esta procesando demasiadas solicitudes de autenticacion.',
                );
            }
        });

        it('should re-throw unknown errors', async () => {
            const context = mockExecutionContext();

            mockBulkhead.execute.mockRejectedValue(new Error('Unexpected error'));

            await expect(guard.canActivate(context)).rejects.toThrow(Error);
            await expect(guard.canActivate(context)).rejects.toThrow('Unexpected error');
        });

        it('should log a warning when bulkhead is saturated', async () => {
            const context = mockExecutionContext();
            const loggerWarn = jest.spyOn((guard as any).logger, 'warn').mockImplementation();

            mockBulkhead.execute.mockRejectedValue(new BulkheadRejectedError('Bulkhead is full'));
            mockBulkhead.getMetrics.mockReturnValue({
                activeCalls:        3,
                queuedCalls:        5,
                maxConcurrentCalls: 3,
                maxQueueSize:       5,
                name:               'oauth:token',
                totalCalls:         100,
                successfulCalls:    90,
                failedCalls:        5,
                rejectedCalls:      5,
                timedOutCalls:      0,
                averageDurationMs:  50,
            });

            await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
            expect(loggerWarn).toHaveBeenCalled();

            loggerWarn.mockRestore();
        });
    });
});
