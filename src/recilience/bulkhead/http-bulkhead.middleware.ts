import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import PQueue from 'p-queue';

/** Máximo de requests procesándose en simultáneo (valor por defecto) */
const DEFAULT_CONCURRENCY = 50;
/** Máximo de requests en espera antes de rechazar con 429 (valor por defecto) */
const DEFAULT_MAX_QUEUE   = 100;

/**
 * Middleware de bulkhead para el servidor HTTP entrante.
 *
 * Protege el servicio de sobrecarga limitando cuántos requests se procesan
 * simultáneamente y cuántos pueden esperar en cola.
 *
 * **Configuración (variables de entorno):**
 * - `HTTP_BULKHEAD_CONCURRENCY`  — máximo de requests simultáneos   (default: 50)
 * - `HTTP_BULKHEAD_MAX_QUEUE`    — máximo de requests en espera      (default: 100)
 *
 * **Exclusiones:** `/health/status` no pasa por este middleware
 * para que los sistemas de monitoreo siempre puedan consultar el estado.
 */
@Injectable()
export class HttpBulkheadMiddleware implements NestMiddleware {
    private readonly logger = new Logger(HttpBulkheadMiddleware.name);
    private readonly queue:        PQueue;
    private readonly maxQueueSize: number;

    constructor(private readonly config: ConfigService) {
        const concurrency = config.get<number>('bulkhead.http.concurrency') ?? DEFAULT_CONCURRENCY;
        this.maxQueueSize = config.get<number>('bulkhead.http.maxQueueSize') ?? DEFAULT_MAX_QUEUE;
        this.queue = new PQueue({ concurrency });

        this.logger.log(
            `HTTP Bulkhead activo — concurrencia: ${concurrency}, cola máxima: ${this.maxQueueSize}`,
        );
    }

    use(req: Request, res: Response, next: NextFunction): void {
        // Cola llena → rechazo inmediato
        if (this.queue.size >= this.maxQueueSize) {
            this.logger.warn(
                `Bulkhead HTTP saturado [activos=${this.queue.pending} en_cola=${this.queue.size}]` +
                ` — rechazando ${req.method} ${req.path}`,
            );
            res.status(429).json({
                statusCode: 429,
                error:      'Too Many Requests',
                message:    'El servicio está temporalmente saturado. Intente nuevamente en unos segundos.',
            });
            return;
        }

        // Encola el request; el slot se libera cuando la respuesta termina
        this.queue.add(
            () => new Promise<void>((resolve) => {
                res.once('finish', resolve);
                res.once('close',  resolve);
                next();
            }),
        );
    }

    /**
     * Métricas actuales del bulkhead HTTP.
     * Expuesto en `GET /health/status` para monitoreo.
     */
    getStats() {
        return {
            active:       this.queue.pending,
            queued:       this.queue.size,
            concurrency:  this.queue.concurrency,
            maxQueueSize: this.maxQueueSize,
        };
    }
}
