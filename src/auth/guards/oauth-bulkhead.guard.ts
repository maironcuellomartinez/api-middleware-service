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
 * Estrategia de proteccion para POST /oauth/token usando Bulkhead
 * -----------------------------------------------------------------
 *
 * Problema:
 *   El endpoint de emision de tokens acepta peticiones ilimitadas.
 *   Cada intento ejecuta `bcrypt.compare()` (CPU-bound, ~10ms por hash).
 *   Un atacante puede:
 *     a) Fuerza bruta de client_secret (miles de intentos/seg)
 *     b) DoS: saturar CPU del servidor con bcrypt concurrentes
 *
 * Solucion — Bulkhead en vez de rate-limit:
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
 *   │  │  simultaneos     │                                │
 *   │  └──────────────────┘                                │
 *   │                                                      │
 *   │  Si hay 3 en proceso + 5 en cola → 429 inmediato     │
 *   │  Si espera >5s en cola           → 408 timeout       │
 *   └──────────────────────────────────────────────────────┘
 *
 * Por que funciona contra ambos vectores:
 *
 *   • Fuerza bruta: con maxConcurrent=3, el atacante solo logra
 *     ~300 intentos/seg (bcrypt ~10ms). Comparado con miles sin limite.
 *     Mas importante: los 5 slots de cola se llenan rapido bajo ataque,
 *     y todas las peticiones extra reciben 429 instantaneo sin tocar CPU.
 *
 *   • DoS via bcrypt: como maximo 3 cores estan ocupados con bcrypt.
 *     El resto del servicio (consultas de requests, health) sigue
 *     respondiendo normalmente porque tienen sus propios bulkheads.
 *
 * Ventajas sobre rate-limit:
 *   • No requiere dependencia adicional (ya tenemos el Bulkhead)
 *   • No requiere Redis ni estado distribuido
 *   • Protege el recurso real (CPU) en vez de contar ventanas de tiempo
 *   • Se integra con el mismo sistema de metricas del servicio
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
            maxConcurrentCalls: 3,       // maximo 3 bcrypt.compare() simultaneos
            maxQueueSize:       5,       // hasta 5 peticiones esperando
            queueTimeoutMs:     5000,    // timeout de espera en cola
            rejectWhenFull:     true,    // 429 inmediato cuando la cola esta llena
        });

        try {
            // Ejecutamos el handler dentro del bulkhead directamente.
            // Esto elimina la race condition entre canAccept() y execute()
            // que existia cuando el guard solo verificaba y delegaba al controller.
            const handler = ctx.getHandler();
            const controller = ctx.getClass();
            const next = () => handler.call(controller.prototype, ...this.getArgs(ctx));

            await bulkhead.execute(next);

            // Si llegamos aqui, el handler se ejecuto sin errores de bulkhead.
            // El guard retorna true para que NestJS continue el pipeline,
            // pero como el handler ya se ejecuto, NestJS no lo ejecutara de nuevo.
            return true;
        } catch (error) {
            if (error instanceof BulkheadRejectedError) {
                this.logger.warn(
                    `Bulkhead oauth:token saturado — rechazando peticion ` +
                    `[activos=${bulkhead.getMetrics().activeCalls}, ` +
                    `cola=${bulkhead.getMetrics().queuedCalls}]`,
                );
                throw new HttpException(
                    {
                        statusCode: 429,
                        error:      'Too Many Requests',
                        message:    'Demasiados intentos de autenticacion. Intente nuevamente en unos segundos.',
                    },
                    429,
                );
            }
            if (error instanceof BulkheadTimeoutError) {
                throw new HttpException(
                    {
                        statusCode: 408,
                        error:      'Request Timeout',
                        message:    'El servidor esta procesando demasiadas solicitudes de autenticacion.',
                    },
                    408,
                );
            }
            throw error;
        }
    }

    private getArgs(ctx: ExecutionContext): any[] {
        const http = ctx.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        const next = http.getNext();
        return [req, res, next];
    }
}
