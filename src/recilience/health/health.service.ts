import { Injectable, Logger } from '@nestjs/common';
import {
    HealthCheckService,
    TypeOrmHealthIndicator,
    MemoryHealthIndicator,
    DiskHealthIndicator,
} from '@nestjs/terminus';
import { GatewayClient } from '../../gateway/gateway.client';
import { HttpBulkheadMiddleware } from '../bulkhead/http-bulkhead.middleware';

@Injectable()
export class HealthService {
    private readonly logger = new Logger(HealthService.name);
    readonly startTime: number = Date.now();

    constructor(
        private readonly health: HealthCheckService,
        private readonly db: TypeOrmHealthIndicator,
        private readonly memory: MemoryHealthIndicator,
        private readonly disk: DiskHealthIndicator,
        private readonly gateway: GatewayClient,
        private readonly bulkhead: HttpBulkheadMiddleware,
    ) { }

    async getStatus() {
        // gateway y bulkhead se calculan siempre — independientemente de si terminus falla
        const gateway  = this.safeCall(() => this.gateway.getStatus(),  'GatewayClient no disponible');
        const bulkhead = this.safeCall(() => this.bulkhead.getStats(),  'Bulkhead no disponible');

        // terminus puede lanzar HealthCheckError si algun check falla;
        // lo atrapamos para que el endpoint siempre devuelva gateway y bulkhead
        let terminusResult: Record<string, unknown> = {};
        try {
            terminusResult = await this.health.check([
                () => this.db.pingCheck('database',       { timeout: 1000 }),
                () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
                () => this.memory.checkRSS('memory_rss',  300 * 1024 * 1024),
                () => this.disk.checkStorage('disk_storage', { thresholdPercent: 0.9, path: '/' }),
            ]) as Record<string, unknown>;
        } catch (err: any) {
            terminusResult = err?.response ?? { status: 'error', error: String(err?.message ?? err) };
            this.logger.warn(`Health check degradado: ${err?.message}`);
        }

        return { ...terminusResult, gateway, bulkhead };
    }

    getPing() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
        };
    }

    private safeCall<T extends Record<string, unknown>>(fn: () => T, fallbackMessage: string): T | { error: string } {
        try {
            return fn();
        } catch (err) {
            this.logger.warn(`Health metric fallback: ${fallbackMessage} — ${(err as Error).message}`);
            return { error: fallbackMessage };
        }
    }
}
