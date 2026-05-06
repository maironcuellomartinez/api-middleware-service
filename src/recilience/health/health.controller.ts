import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { GatewayClient } from '../../gateway/gateway.client';
import { HttpBulkheadMiddleware } from '../bulkhead/http-bulkhead.middleware';

/**
 * Endpoints de salud y resiliencia — sin autenticación.
 * Diseñados para k8s, Prometheus u otros sistemas de monitoreo.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(
        private readonly gateway: GatewayClient,
        private readonly bulkhead: HttpBulkheadMiddleware,
    ) { }

    /**
     * Devuelve el estado del bulkhead HTTP entrante, el circuit breaker
     * y las colas del bulkhead saliente hacia el api-gateway.
     * No requiere Bearer token.
     */
    @Get('status')
    @ApiOperation({ summary: 'Estado de resiliencia completo (sin auth)' })
    getStatus() {
        return {
            httpBulkhead: this.bulkhead.getStats(),
            ...this.gateway.getStatus(),
        };
    }
}
