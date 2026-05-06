import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { OAuthBulkheadGuard } from './oauth-bulkhead.guard';
import { BulkheadRegistry } from '../../recilience/bulkhead/bulkhead.registry';
import { Bulkhead, BulkheadRejectedError, BulkheadTimeoutError } from '../../recilience/bulkhead/bulkhead';

describe('OAuthBulkheadGuard', () => {
    let guard: OAuthBulkheadGuard;
    let registry: jest.Mocked<BulkheadRegistry>;
    let mockBulkhead: jest.Mocked<Bulkhead>;

    const mockRequest = () => ({}) as any;

    const mockExecutionContext = (request: any) =>
        ({
            switchToHttp: () => ({
                getRequest: () => request,
            }),
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
        it('should return true and store bulkhead in request when capacity is available', async () => {
            const request = mockRequest();
            const context = mockExecutionContext(request);

            mockBulkhead.canAccept.mockReturnValue(true);
            mockBulkhead.getMetrics.mockReturnValue({
                activeCalls:        1,
                queuedCalls:        0,
                maxConcurrentCalls: 3,
                maxQueueSize:       5,
                name:               'oauth:token',
                totalCalls:         10,
                successfulCalls:    9,
                failedCalls:        0,
                rejectedCalls:      0,
                timedOutCalls:      0,
                averageDurationMs:  50,
            });

            const result = await guard.canActivate(context);

            expect(result).toBe(true);
            expect((request as any).__oauthBulkhead).toBe(mockBulkhead);
            expect(registry.getOrCreate).toHaveBeenCalledWith({
                name:               'oauth:token',
                maxConcurrentCalls: 3,
                maxQueueSize:       5,
                queueTimeoutMs:     5000,
                rejectWhenFull:     true,
            });
        });

        it('should throw 429 when bulkhead cannot accept (saturated)', async () => {
            const request = mockRequest();
            const context = mockExecutionContext(request);

            mockBulkhead.canAccept.mockReturnValue(false);
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
                    'Demasiados intentos de autenticación. Intente nuevamente en unos segundos.',
                );
            }
        });

        it('should throw 429 when BulkheadRejectedError is caught', async () => {
            const request = mockRequest();
            const context = mockExecutionContext(request);

            mockBulkhead.canAccept.mockImplementation(() => {
                throw new BulkheadRejectedError('Bulkhead is full');
            });

            await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

            try {
                await guard.canActivate(context);
            } catch (e: any) {
                expect(e.getStatus()).toBe(429);
            }
        });

        it('should throw 408 when BulkheadTimeoutError is caught', async () => {
            const request = mockRequest();
            const context = mockExecutionContext(request);

            mockBulkhead.canAccept.mockImplementation(() => {
                throw new BulkheadTimeoutError('Bulkhead timeout');
            });

            await expect(guard.canActivate(context)).rejects.toThrow(HttpException);

            try {
                await guard.canActivate(context);
            } catch (e: any) {
                expect(e.getStatus()).toBe(408);
                expect(e.getResponse().message).toBe(
                    'El servidor está procesando demasiadas solicitudes de autenticación.',
                );
            }
        });

        it('should re-throw unknown errors', async () => {
            const request = mockRequest();
            const context = mockExecutionContext(request);

            mockBulkhead.canAccept.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await expect(guard.canActivate(context)).rejects.toThrow(Error);
            await expect(guard.canActivate(context)).rejects.toThrow('Unexpected error');
        });

        it('should log a warning when bulkhead is saturated', async () => {
            const request = mockRequest();
            const context = mockExecutionContext(request);
            const loggerWarn = jest.spyOn((guard as any).logger, 'warn').mockImplementation();

            mockBulkhead.canAccept.mockReturnValue(false);
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
