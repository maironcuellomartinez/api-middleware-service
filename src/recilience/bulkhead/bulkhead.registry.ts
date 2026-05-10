import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bulkhead, BulkheadConfig, BulkheadMetrics } from './bulkhead';

export interface BulkheadOptions extends Partial<BulkheadConfig> {
    name: string;
}

@Injectable()
export class BulkheadRegistry implements OnModuleInit {
    private bulkheads = new Map<string, Bulkhead>();
    private defaultConfig: Omit<BulkheadConfig, 'name'> = {
        maxConcurrentCalls: 10,
        maxQueueSize: 100,
        queueTimeoutMs: 30000,
        rejectWhenFull: true,
    };

    onModuleInit() {
        this.createDefaultBulkheads();
    }

    getOrCreate(options: BulkheadOptions): Bulkhead {
        if (!this.bulkheads.has(options.name)) {
            const config: BulkheadConfig = { ...this.defaultConfig, ...options, name: options.name };
            this.bulkheads.set(options.name, new Bulkhead(config));
        }
        return this.bulkheads.get(options.name)!;
    }

    getForClient(clientId: string, endpoint?: string): Bulkhead {
        const name = endpoint ? `client:${clientId}:${endpoint}` : `client:${clientId}`;
        return this.getOrCreate({ name, maxConcurrentCalls: 5, maxQueueSize: 20 });
    }

    getForService(serviceName: string): Bulkhead {
        return this.getOrCreate({ name: `service:${serviceName}`, maxConcurrentCalls: 20, maxQueueSize: 200 });
    }

    getForAbac(clientId?: string): Bulkhead {
        if (clientId) {
            return this.getOrCreate({
                name: `abac:${clientId}`,
                maxConcurrentCalls: 3,
                maxQueueSize: 50,
                queueTimeoutMs: 5000,
            });
        }
        return this.getOrCreate({ name: 'abac:global', maxConcurrentCalls: 10, maxQueueSize: 100, queueTimeoutMs: 5000 });
    }

    getForDatabase(schema: string): Bulkhead {
        return this.getOrCreate({ name: `database:${schema}`, maxConcurrentCalls: 15, maxQueueSize: 150, rejectWhenFull: true });
    }

    getForHttpExternal(serviceName: string): Bulkhead {
        return this.getOrCreate({ name: `http:${serviceName}`, maxConcurrentCalls: 8, maxQueueSize: 50, queueTimeoutMs: 10000 });
    }

    getAllMetrics(): Record<string, BulkheadMetrics> {
        const metrics: Record<string, BulkheadMetrics> = {};
        for (const [name, bulkhead] of this.bulkheads) {
            metrics[name] = bulkhead.getMetrics();
        }
        return metrics;
    }

    getForServiceNow(): Bulkhead {
        return this.getOrCreate({ name: 'servicenow:api', maxConcurrentCalls: 8, maxQueueSize: 40, rejectWhenFull: true });
    }

    resetAllMetrics(): void {
        for (const bulkhead of this.bulkheads.values()) {
            bulkhead.resetMetrics();
        }
    }

    getOverloadedBulkheads(): BulkheadMetrics[] {
        const overloaded: BulkheadMetrics[] = [];
        for (const bulkhead of this.bulkheads.values()) {
            const metrics = bulkhead.getMetrics();
            if (metrics.activeCalls >= metrics.maxConcurrentCalls * 0.8) {
                overloaded.push(metrics);
            }
        }
        return overloaded;
    }

    private createDefaultBulkheads(): void {
        this.getOrCreate({ name: 'gateway:high', maxConcurrentCalls: 10, maxQueueSize: 50, queueTimeoutMs: 5000 });
        this.getOrCreate({ name: 'gateway:low', maxConcurrentCalls: 5, maxQueueSize: 100, queueTimeoutMs: 10000 });
    }
}
