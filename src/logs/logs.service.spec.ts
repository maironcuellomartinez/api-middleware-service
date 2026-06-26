import { LogsService } from './logs.service';

describe('LogsService', () => {
    let service: LogsService;

    const makeLog = (overrides = {}) => ({
        method:     'GET',
        url:        '/v1/requests',
        statusCode: 200,
        durationMs: 42,
        ip:         '127.0.0.1',
        userAgent:  'jest',
        ...overrides,
    });

    beforeEach(() => {
        service = new LogsService();
    });

    describe('push', () => {
        it('should add a log to the buffer', () => {
            service.push(makeLog());

            expect(service.findRecent(10)).toHaveLength(1);
        });

        it('should assign auto-incrementing ids', () => {
            service.push(makeLog());
            service.push(makeLog());
            service.push(makeLog());

            const logs = service.findRecent(10);
            const ids = logs.map((l) => l.id).sort((a, b) => a - b);
            expect(ids).toEqual([1, 2, 3]);
        });

        it('should attach a timestamp on push', () => {
            const before = new Date().toISOString();
            service.push(makeLog());
            const after = new Date().toISOString();

            const log = service.findRecent(1)[0]!;
            expect(log.timestamp >= before).toBe(true);
            expect(log.timestamp <= after).toBe(true);
        });

        it('should evict the oldest entry when buffer reaches 50 (FIFO)', () => {
            for (let i = 1; i <= 50; i++) {
                service.push(makeLog({ url: `/v1/requests?i=${i}` }));
            }

            const firstEntry = service.findRecent(50).at(-1)!;
            expect(firstEntry.url).toBe('/v1/requests?i=1');

            service.push(makeLog({ url: '/v1/requests?i=51' }));

            const all = service.findRecent(50);
            expect(all).toHaveLength(50);
            expect(all.map((l) => l.url)).not.toContain('/v1/requests?i=1');
            expect(all[0]!.url).toBe('/v1/requests?i=51');
        });

        it('should keep exactly 50 entries after many pushes', () => {
            for (let i = 0; i < 200; i++) {
                service.push(makeLog());
            }

            expect(service.findRecent(200)).toHaveLength(50);
        });
    });

    describe('findRecent', () => {
        it('should return entries in newest-first order', () => {
            service.push(makeLog({ url: '/first' }));
            service.push(makeLog({ url: '/second' }));
            service.push(makeLog({ url: '/third' }));

            const logs = service.findRecent(10);
            expect(logs[0]!.url).toBe('/third');
            expect(logs[1]!.url).toBe('/second');
            expect(logs[2]!.url).toBe('/first');
        });

        it('should respect the limit parameter', () => {
            for (let i = 0; i < 20; i++) service.push(makeLog());

            expect(service.findRecent(5)).toHaveLength(5);
            expect(service.findRecent(10)).toHaveLength(10);
        });

        it('should return all entries when limit exceeds buffer size', () => {
            service.push(makeLog());
            service.push(makeLog());

            expect(service.findRecent(100)).toHaveLength(2);
        });

        it('should return empty array when buffer is empty', () => {
            expect(service.findRecent(10)).toEqual([]);
        });
    });
});
