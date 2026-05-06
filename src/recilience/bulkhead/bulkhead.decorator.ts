import { BulkheadRegistry } from './bulkhead.registry';

/**
 * Decorador de método para ejecutar dentro de un bulkhead nombrado.
 * Requiere que la clase tenga `bulkheadRegistry: BulkheadRegistry` inyectado.
 */
export function WithBulkhead(options: { name: string; maxConcurrent?: number; timeoutMs?: number }) {
    return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args: any[]) {
            const registry: BulkheadRegistry = (this as any).bulkheadRegistry;
            if (!registry) throw new Error('BulkheadRegistry not injected in class.');

            const bulkhead = registry.getOrCreate({
                name:               options.name,
                maxConcurrentCalls: options.maxConcurrent ?? 5,
                queueTimeoutMs:     options.timeoutMs     ?? 30000,
                maxQueueSize:       50,
                rejectWhenFull:     true,
            });

            return bulkhead.execute(() => originalMethod.apply(this, args));
        };

        return descriptor;
    };
}
