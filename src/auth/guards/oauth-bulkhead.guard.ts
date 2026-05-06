import {
    Injectable,
    CanActivate,
    ExecutionContext,
    HttpException,
    Logger,
} from '@nestjs/common';
import { BulkheadRegistry } from '../../recilience/bulkhead/bulkhead.registry';
import { BulkheadRejectedError, BulkheadTimeoutError } from '../../recilience/bulkhead/bulkhead';

/**
 * Estrategia de protección para POST /oauth/token usando Bulkhead
 * ──────────────────────────────────────────────────────────────────
 *
 * Problema:
 *   El endpoint de emisión de tokens acepta peticiones ilimitadas.
 *   Cada intento ejecuta `bcrypt.compare()` (CPU-bound, ~10ms por hash).
 *   Un atacante puede:
 *     a) Fuerza bruta de client_secret (miles de intentos/seg)
 *     b) DoS: saturar CPU del servidor con bcrypt concurrentes
 *
 * Solución — Bulkhead en vez de rate-limit:
 *   En vez de limitar por IP o por ventana de tiempo (que requiere
 *   estado distribuido, Redis, o una dependencia adicional como
 *   @nestjs/throttler), usamos el Bulkhead que ya tenemos:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  POST /oauth/token                                   │
 *   │                                                      │
 *   │  ┌──────────────────┐                                │
 *   │  │  OAuthBulkhead   │  maxConcurrent: 3              │
 *   │  │  Guard            │  maxQueue:      5              │
 *   │  │                  │  timeout:       5s             │
 *   │  │  Solo 3 bcrypt   │  rejectWhenFull: true          │
 *   │  │  simultáneos     │                                │
 *   │  └──────────────────┘                                │
 *   │                                                      │
 *   │  Si hay 3 en proceso + 5 en cola → 429 inmediato     │
 *   │  Si espera >5s en cola           → 408 timeout       │
 *   └──────────────────────────────────────────────────────┘
 *
 * Por qué funciona contra ambos vectores:
 *
 *   • Fuerza bruta: con maxConcurrent=3, el atacante solo logra
 *     ~300 intentos/seg (bcrypt ~10ms). Comparado con miles sin límite.
 *     Más importante: los 5 slots de cola se llenan rápido bajo ataque,
 *     y todas las peticiones extra reciben 429 instantáneo sin tocar CPU.
 *
 *   • DoS via bcrypt: como máximo 3 cores están ocupados con bcrypt.
 *     El resto del servicio (consultas de requests, health) sigue
 *     respondiendo normalmente porque tienen sus propios bulkheads.
 *
 * Ventajas sobre rate-limit:
 *   • No requiere dependencia adicional (ya tenemos el Bulkhead)
 *   • No requiere Redis ni estado distribuido
 *   • Protege el recurso real (CPU) en vez de contar ventanas de tiempo
 *   • Se integra con el mismo sistema de métricas del servicio
 *
 * Uso:
 *   @UseGuards(OAuthBulkheadGuard)
 *   @Post('token')
 *   issueToken(...)
 */
@Injectable()
export class OAuthBulkheadGuard implements CanActivate {
    private readonly logger = new Logger(OAuthBulkheadGuard.name);

    constructor(private readonly registry: BulkheadRegistry) {}

    async canActivate(ctx: ExecutionContext): Promise<boolean> {
        const bulkhead = this.registry.getOrCreate({
            name:               'oauth:token',
            maxConcurrentCalls: 3,       // máximo 3 bcrypt.compare() simultáneos
            maxQueueSize:       5,       // hasta 5 peticiones esperando
            queueTimeoutMs:     5000,    // timeout de espera en cola
            rejectWhenFull:     true,    // 429 inmediato cuando la cola está llena
        });

        try {
            // Envolvemos next() en el bulkhead: el guard adquiere el slot,
            // pero el slot no se libera hasta que el handler complete.
            // Para eso usamos una técnica de "acquire + release":
            // guardamos el bulkhead en el request para que un interceptor
            // o el propio flujo lo libere. Pero dado que NestJS guards
            // son sincrónicos respecto al pipeline, la forma más directa
            // es simplemente verificar si puede aceptar.

            if (!bulkhead.canAccept()) {
                this.logger.warn(
                    `Bulkhead oauth:token saturado — rechazando petición ` +
                    `[activos=${bulkhead.getMetrics().activeCalls}, ` +
                    `cola=${bulkhead.getMetrics().queuedCalls}]`,
                );
                throw new HttpException(
                    {
                        statusCode: 429,
                        error:      'Too Many Requests',
                        message:    'Demasiados intentos de autenticación. Intente nuevamente en unos segundos.',
                    },
                    429,
                );
            }

            // Almacenamos el bulkhead en el request para que el controller
            // ejecute la lógica dentro de bulkhead.execute()
            const request = ctx.switchToHttp().getRequest();
            (request as any).__oauthBulkhead = bulkhead;

            return true;
        } catch (error) {
            if (error instanceof BulkheadRejectedError) {
                throw new HttpException(
                    {
                        statusCode: 429,
                        error:      'Too Many Requests',
                        message:    'Demasiados intentos de autenticación. Intente nuevamente en unos segundos.',
                    },
                    429,
                );
            }
            if (error instanceof BulkheadTimeoutError) {
                throw new HttpException(
                    {
                        statusCode: 408,
                        error:      'Request Timeout',
                        message:    'El servidor está procesando demasiadas solicitudes de autenticación.',
                    },
                    408,
                );
            }
            throw error;
        }
    }
}
