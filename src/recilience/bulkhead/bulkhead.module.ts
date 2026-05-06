import { Module } from '@nestjs/common';
import { HttpBulkheadMiddleware } from './http-bulkhead.middleware';
import { BulkheadRegistry } from './bulkhead.registry';
import { BulkheadService } from './bulkhead.service';
import { BulkheadGuard } from './bulkhead.guard';
import { BulkheadInterceptor } from './bulkhead.interceptor';

/**
 * Provee toda la librería de bulkhead como singleton en el árbol de DI.
 * `HttpBulkheadMiddleware` es exportado para que AppModule pueda aplicarlo
 * como middleware y HealthController pueda leer sus métricas.
 */
@Module({
    providers: [
        HttpBulkheadMiddleware,
        BulkheadRegistry,
        BulkheadService,
        BulkheadGuard,
        BulkheadInterceptor,
    ],
    exports: [
        HttpBulkheadMiddleware,
        BulkheadRegistry,
        BulkheadService,
        BulkheadGuard,
        BulkheadInterceptor,
    ],
})
export class BulkheadModule {}
