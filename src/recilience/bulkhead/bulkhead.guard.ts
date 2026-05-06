import { Injectable, CanActivate, ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BulkheadRegistry } from './bulkhead.registry';

export interface BulkheadOptions {
    name?:         string;
    perClient?:    boolean;
    maxConcurrent?: number;
    timeoutMs?:    number;
}

export const UseBulkhead = (options: BulkheadOptions = {}) =>
    Reflector.createDecorator<BulkheadOptions>({ key: 'bulkhead', transform: () => options });

@Injectable()
export class BulkheadGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly bulkheadRegistry: BulkheadRegistry,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const options = this.reflector.get<BulkheadOptions>('bulkhead', context.getHandler());
        if (!options) return true;

        const request  = context.switchToHttp().getRequest();
        const clientId = request.headers['x-client-id'] || 'anonymous';

        const bulkhead = options.perClient
            ? this.bulkheadRegistry.getForClient(clientId, options.name ?? request.route?.path)
            : this.bulkheadRegistry.getForService(options.name ?? 'default');

        if (!bulkhead.canAccept()) {
            throw new ServiceUnavailableException('Service temporarily unavailable due to high load');
        }

        (request as any).bulkhead = bulkhead;
        return true;
    }
}
