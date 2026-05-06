import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { GatewayClient } from './gateway.client';

// Mock opossum circuit breaker
jest.mock('opossum', () => {
    const mockBreaker = {
        fire:      jest.fn(),
        on:        jest.fn(),
        fallback:  jest.fn((fn) => { mockBreaker._fallback = fn; }),
        opened:    false,
        halfOpen:  false,
        stats:     { successes: 10, failures: 0, rejects: 0 },
        _fallback: null as any,
    };
    return jest.fn(() => mockBreaker);
});

describe('GatewayClient', () => {
    let client: GatewayClient;
    let httpService: jest.Mocked<HttpService>;
    let configService: jest.Mocked<ConfigService>;

    const mockBreaker = require('opossum')();

    const mockAxiosResponse = (data: any, status = 200): AxiosResponse => ({
        data,
        status,
        statusText: 'OK',
        headers:     {},
        config:      {} as any,
    });

    beforeEach(async () => {
        httpService = {
            get: jest.fn(),
        } as any;

        configService = {
            get: jest.fn(),
        } as any;

        configService.get.mockImplementation((key: string) => {
            if (key === 'gateway.url') return 'http://gateway:3000';
            if (key === 'gateway.m2mToken') return 'm2m-token';
            return undefined;
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                GatewayClient,
                { provide: HttpService,  useValue: httpService },
                { provide: ConfigService, useValue: configService },
            ],
        }).compile();

        client = module.get<GatewayClient>(GatewayClient);

        // Reset mock breaker state between tests
        mockBreaker.opened = false;
        mockBreaker.halfOpen = false;
        mockBreaker.fire.mockReset();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should read gateway URL and M2M token from config', () => {
            expect(configService.get).toHaveBeenCalledWith('gateway.url');
            expect(configService.get).toHaveBeenCalledWith('gateway.m2mToken');
        });

        it('should use default URL when config is missing', async () => {
            configService.get.mockReturnValue(undefined);

            const module: TestingModule = await Test.createTestingModule({
                providers: [
                    GatewayClient,
                    { provide: HttpService, useValue: httpService },
                    { provide: ConfigService, useValue: configService },
                ],
            }).compile();

            const defaultClient = module.get<GatewayClient>(GatewayClient);
            // Should not throw — uses defaults
            expect(defaultClient).toBeDefined();
        });
    });

    describe('getRequestByNumber', () => {
        it('should call the gateway with the correct URL', async () => {
            const mockData = { id: '123', number: 'REQ0001234' };
            mockBreaker.fire.mockResolvedValue(mockData);

            const result = await client.getRequestByNumber('REQ0001234');

            expect(mockBreaker.fire).toHaveBeenCalledWith(
                'http://gateway:3000/internal-api/requests/by-number/REQ0001234',
            );
            expect(result).toEqual(mockData);
        });

        it('should encode special characters in the number', async () => {
            mockBreaker.fire.mockResolvedValue({});

            await client.getRequestByNumber('REQ#123');

            expect(mockBreaker.fire).toHaveBeenCalledWith(
                expect.stringContaining(encodeURIComponent('REQ#123')),
            );
        });

        it('should propagate circuit breaker fallback error', async () => {
            mockBreaker.fire.mockRejectedValue(
                new ServiceUnavailableException('api-gateway no disponible (circuit open)'),
            );

            await expect(client.getRequestByNumber('REQ0001234')).rejects.toThrow(
                ServiceUnavailableException,
            );
        });
    });

    describe('listRequests', () => {
        it('should call the gateway with query params', async () => {
            const params = { status: 'CREATED', page: '1', limit: '20' };
            mockBreaker.fire.mockResolvedValue({ data: [] });

            const result = await client.listRequests(params);

            expect(mockBreaker.fire).toHaveBeenCalledWith(
                'http://gateway:3000/internal-api/requests',
                params,
            );
            expect(result).toEqual({ data: [] });
        });

        it('should handle empty params', async () => {
            mockBreaker.fire.mockResolvedValue({ data: [] });

            const result = await client.listRequests({});

            expect(mockBreaker.fire).toHaveBeenCalledWith(
                'http://gateway:3000/internal-api/requests',
                {},
            );
            expect(result).toEqual({ data: [] });
        });
    });

    describe('_httpGet (internal)', () => {
        it('should make a GET request with correct headers', async () => {
            httpService.get.mockReturnValue(of(mockAxiosResponse({ data: 'ok' })));

            // Access private method via prototype
            const result = await (client as any)._httpGet(
                'http://gateway:3000/test',
                { param: 'value' },
            );

            expect(httpService.get).toHaveBeenCalledWith(
                'http://gateway:3000/test',
                {
                    params:  { param: 'value' },
                    headers: {
                        'Authorization': 'Bearer m2m-token',
                        'Content-Type':  'application/json',
                    },
                },
            );
            expect(result).toEqual({ data: 'ok' });
        });

        it('should throw NotFoundException on 404', async () => {
            const error = new AxiosError();
            error.response = { status: 404, data: { message: 'Not found' } } as any;
            httpService.get.mockReturnValue(throwError(() => error));

            await expect(
                (client as any)._httpGet('http://gateway:3000/test'),
            ).rejects.toThrow(NotFoundException);
        });

        it('should throw HttpException with upstream message on 4xx', async () => {
            const error = new AxiosError();
            error.response = {
                status: 400,
                data:   { message: 'Invalid parameters' },
            } as any;
            httpService.get.mockReturnValue(throwError(() => error));

            await expect(
                (client as any)._httpGet('http://gateway:3000/test'),
            ).rejects.toThrow(HttpException);

            try {
                await (client as any)._httpGet('http://gateway:3000/test');
            } catch (e: any) {
                expect(e.getStatus()).toBe(400);
                expect(e.message).toBe('Invalid parameters');
            }
        });

        it('should throw generic HttpException when upstream has no message', async () => {
            const error = new AxiosError();
            error.response = { status: 502, data: {} } as any;
            httpService.get.mockReturnValue(throwError(() => error));

            await expect(
                (client as any)._httpGet('http://gateway:3000/test'),
            ).rejects.toThrow(HttpException);

            try {
                await (client as any)._httpGet('http://gateway:3000/test');
            } catch (e: any) {
                expect(e.getStatus()).toBe(502);
                expect(e.message).toBe('Error del api-gateway (502)');
            }
        });

        it('should re-throw non-Axios errors', async () => {
            httpService.get.mockReturnValue(throwError(() => new Error('Network error')));

            await expect(
                (client as any)._httpGet('http://gateway:3000/test'),
            ).rejects.toThrow('Network error');
        });
    });

    describe('getStatus', () => {
        it('should return circuit breaker and bulkhead status', () => {
            const status = client.getStatus();

            expect(status).toHaveProperty('circuitBreaker');
            expect(status).toHaveProperty('bulkhead');
            expect(status.circuitBreaker).toHaveProperty('state');
            expect(status.circuitBreaker).toHaveProperty('stats');
            expect(status.bulkhead).toHaveProperty('high');
            expect(status.bulkhead).toHaveProperty('low');
            expect(status.bulkhead.high).toHaveProperty('concurrency', 10);
            expect(status.bulkhead.low).toHaveProperty('concurrency', 5);
        });
    });
});
