import { Test, TestingModule } from '@nestjs/testing';
import { RecordsService } from './records.service';
import { GatewayClient } from '../gateway/gateway.client';
import { ListRequestsDto } from './dto/list-records.dto';

describe('RecordsService', () => {
    let service: RecordsService;
    let gateway: jest.Mocked<GatewayClient>;

    beforeEach(async () => {
        gateway = {
            getRequestByNumber: jest.fn(),
            listRequests:       jest.fn(),
            getStatus:          jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RecordsService,
                { provide: GatewayClient, useValue: gateway },
            ],
        }).compile();

        service = module.get<RecordsService>(RecordsService);
    });

    describe('getRequestByNumber', () => {
        it('should delegate to gateway.getRequestByNumber', async () => {
            const mockResponse = { id: '123', number: 'REQ0001234', status: 'CREATED' };
            gateway.getRequestByNumber.mockResolvedValue(mockResponse);

            const result = await service.getRequestByNumber('REQ0001234');

            expect(gateway.getRequestByNumber).toHaveBeenCalledWith('REQ0001234');
            expect(result).toEqual(mockResponse);
        });

        it('should propagate errors from gateway', async () => {
            gateway.getRequestByNumber.mockRejectedValue(new Error('Not found'));

            await expect(service.getRequestByNumber('REQ0009999')).rejects.toThrow('Not found');
        });
    });

    describe('listRequests', () => {
        it('should delegate to gateway.listRequests with all params', async () => {
            const query: ListRequestsDto = {
                status:      'CREATED,IN_PROGRESS',
                issueTypeId: 'uuid-issue',
                cornerId:    'uuid-corner',
                companyId:   'uuid-company',
                dateFrom:    '2026-01-01',
                dateTo:      '2026-12-31',
                page:        2,
                limit:       50,
            };

            const mockResponse = { data: [], total: 0 };
            gateway.listRequests.mockResolvedValue(mockResponse);

            const result = await service.listRequests(query);

            expect(gateway.listRequests).toHaveBeenCalledWith({
                status:      'CREATED,IN_PROGRESS',
                issueTypeId: 'uuid-issue',
                cornerId:    'uuid-corner',
                companyId:   'uuid-company',
                dateFrom:    '2026-01-01',
                dateTo:      '2026-12-31',
                page:        '2',
                limit:       '50',
            });
            expect(result).toEqual(mockResponse);
        });

        it('should only include defined params', async () => {
            const query: ListRequestsDto = {
                status: 'CREATED',
                page:   1,
                limit:  20,
            };

            gateway.listRequests.mockResolvedValue({ data: [] });

            await service.listRequests(query);

            expect(gateway.listRequests).toHaveBeenCalledWith({
                status: 'CREATED',
                page:   '1',
                limit:  '20',
            });
        });

        it('should handle empty query (no filters)', async () => {
            const query: ListRequestsDto = {};

            gateway.listRequests.mockResolvedValue({ data: [] });

            await service.listRequests(query);

            expect(gateway.listRequests).toHaveBeenCalledWith({});
        });

        it('should propagate errors from gateway', async () => {
            const query: ListRequestsDto = { status: 'ERROR' };
            gateway.listRequests.mockRejectedValue(new Error('Gateway unavailable'));

            await expect(service.listRequests(query)).rejects.toThrow('Gateway unavailable');
        });
    });

    describe('getResilienceStatus', () => {
        it('should return gateway status', () => {
            const status: ReturnType<GatewayClient['getStatus']> = {
                circuitBreaker: {
                    state: 'CLOSED',
                    stats: {
                        successes: 10,
                        failures: 0,
                        rejects: 0,
                        fires: 10,
                        fallbacks: 0,
                        latencyMean: 50,
                        latencyTimes: [50],
                        percentiles: { '50': 50, '90': 50, '99': 50 },
                        timeouts: 0,
                        cacheHits: 0,
                        cacheMisses: 0,
                        semaphoreRejections: 0,
                    },
                },
                bulkhead: { high: { pending: 0, size: 0, concurrency: 10 }, low: { pending: 0, size: 0, concurrency: 5 } },
            };
            gateway.getStatus.mockReturnValue(status);

            const result = service.getResilienceStatus();

            expect(gateway.getStatus).toHaveBeenCalled();
            expect(result).toEqual(status);
        });
    });
});
