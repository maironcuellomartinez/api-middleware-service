import { ConfigService } from '@nestjs/config';
import { HttpLoggerMiddleware } from './http-logger.middleware';
import { LogsService } from '../logs/logs.service';

describe('HttpLoggerMiddleware', () => {
    let middleware: HttpLoggerMiddleware;
    let logsService: jest.Mocked<LogsService>;
    let configService: jest.Mocked<ConfigService>;

    const makeReq = (overrides: any = {}) => ({
        method:      'GET',
        originalUrl: '/v1/requests',
        ip:          '10.0.0.1',
        headers:     { 'user-agent': 'jest-test' },
        ...overrides,
    }) as any;

    const makeRes = () => {
        const listeners: Record<string, Function> = {};
        return {
            statusCode: 200,
            once: (event: string, cb: Function) => { listeners[event] = cb; },
            _emit: (event: string) => listeners[event]?.(),
        } as any;
    };

    const next = jest.fn();

    beforeEach(() => {
        configService = { get: jest.fn().mockReturnValue('development') } as any;
        logsService   = { push: jest.fn() } as any;
        middleware     = new HttpLoggerMiddleware(configService, logsService);
        jest.clearAllMocks();
    });

    it('should call next()', () => {
        const req = makeReq();
        const res = makeRes();

        middleware.use(req, res, next);

        expect(next).toHaveBeenCalled();
    });

    it('should push to LogsService when response finishes', () => {
        const req = makeReq();
        const res = makeRes();
        res.statusCode = 201;

        middleware.use(req, res, next);
        res._emit('finish');

        expect(logsService.push).toHaveBeenCalledWith(expect.objectContaining({
            method:     'GET',
            url:        '/v1/requests',
            statusCode: 201,
            ip:         '10.0.0.1',
            userAgent:  'jest-test',
            durationMs: expect.any(Number),
        }));
    });

    it('should not push to LogsService before response finishes', () => {
        middleware.use(makeReq(), makeRes(), next);

        expect(logsService.push).not.toHaveBeenCalled();
    });

    it('should work without LogsService (@Optional)', () => {
        const middlewareWithoutLogs = new HttpLoggerMiddleware(configService, undefined);
        const res = makeRes();

        middlewareWithoutLogs.use(makeReq(), res, next);
        expect(() => res._emit('finish')).not.toThrow();
    });

    it('should record a non-negative durationMs', () => {
        const req = makeReq();
        const res = makeRes();

        middleware.use(req, res, next);
        res._emit('finish');

        const { durationMs } = logsService.push.mock.calls[0]![0]!;
        expect(durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include empty string for ip when ip is undefined', () => {
        const req = makeReq({ ip: undefined });
        const res = makeRes();

        middleware.use(req, res, next);
        res._emit('finish');

        expect(logsService.push).toHaveBeenCalledWith(expect.objectContaining({ ip: '' }));
    });

    it('should include empty string for userAgent when header is missing', () => {
        const req = makeReq({ headers: {} });
        const res = makeRes();

        middleware.use(req, res, next);
        res._emit('finish');

        expect(logsService.push).toHaveBeenCalledWith(expect.objectContaining({ userAgent: '' }));
    });
});
