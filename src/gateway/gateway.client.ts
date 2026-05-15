import { Injectable, Logger, ServiceUnavailableException, NotFoundException, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import PQueue from 'p-queue';
import {
    CircuitBreaker,
    CircuitBreakerRegistry,
    CircuitBreakerState,
    CircuitBreakerOpenError,
    isHttpServerError,
} from '@backendkit-labs/circuit-breaker';

@Injectable()
export class GatewayClient {
    private readonly logger = new Logger(GatewayClient.name);
    private readonly baseUrl: string;
    private readonly headers: Record<string, string>;

    /** Alta prioridad: by-number lookups (consultas puntuales) */
    private readonly highPriority: PQueue;
    /** Baja prioridad: list queries con filtros (potencialmente costosas) */
    private readonly lowPriority: PQueue;

    private readonly breaker: CircuitBreaker;

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
    ) {
        this.baseUrl = this.config.get<string>('gateway.url') ?? 'http://localhost:3000';
        const m2mToken = this.config.get<string>('gateway.m2mToken') ?? '';
        this.headers = { 'Authorization': `Bearer ${m2mToken}`, 'Content-Type': 'application/json' };

        this.highPriority = new PQueue({ concurrency: 10 });
        this.lowPriority = new PQueue({ concurrency: 5 });

        this.breaker = new CircuitBreakerRegistry().getOrCreate({
            name: 'api-gateway',
            failureThreshold: 50,
            minimumCalls: 5,
            slidingWindowSize: 10,
            openTimeoutMs: 30000,
            isFailure: isHttpServerError,
            onStateChange: (_from, to) => {
                if (to === CircuitBreakerState.OPEN)
                    this.logger.warn('Circuit breaker OPEN — api-gateway no disponible');
                else if (to === CircuitBreakerState.HALF_OPEN)
                    this.logger.log('Circuit breaker HALF-OPEN — probando api-gateway');
                else
                    this.logger.log('Circuit breaker CLOSED — api-gateway disponible');
            },
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    getRequestByNumber(number: string): Promise<unknown> {
        return this.highPriority.add(() =>
            this.breaker.execute(
                () => this._httpGet(`${this.baseUrl}/internal-api/requests/by-number/${encodeURIComponent(number)}`),
                (err) => { throw this.handleFallback(err); },
            ),
        );
    }

    listRequests(params: Record<string, string>): Promise<unknown> {
        return this.lowPriority.add(() =>
            this.breaker.execute(
                () => this._httpGet(`${this.baseUrl}/internal-api/requests`, params),
                (err) => { throw this.handleFallback(err); },
            ),
        );
    }

    // ── Métricas del estado de resiliencia ────────────────────────────────────

    getStatus() {
        return {
            circuitBreaker: this.breaker.getMetrics(),
            bulkhead: {
                high: { pending: this.highPriority.pending, size: this.highPriority.size, concurrency: 10 },
                low: { pending: this.lowPriority.pending, size: this.lowPriority.size, concurrency: 5 },
            },
        };
    }

    // ── Método interno (envuelto por el circuit breaker) ─────────────────────

    private async _httpGet(url: string, params?: Record<string, string>): Promise<unknown> {
        try {
            const response = await firstValueFrom(
                this.http.get(url, { params, headers: this.headers, timeout: 5000 }),
            );
            return response.data;
        } catch (err) {
            if (err instanceof AxiosError && err.response) {
                const status = err.response.status;
                if (status === 404) throw new NotFoundException('Recurso no encontrado');
                const upstream = err.response.data;
                const message = typeof upstream?.message === 'string'
                    ? upstream.message
                    : `Error del api-gateway (${status})`;
                throw new HttpException(message, status);
            }
            throw err;
        }
    }

    /**
     * Fallback del circuit breaker.
     * CircuitBreakerOpenError  → servicio no disponible (circuito abierto).
     * Otros errores de infra   → se re-lanzan tal cual (ya son HttpException con 5xx).
     */
    private handleFallback(err: unknown): Error {
        if (err instanceof CircuitBreakerOpenError)
            return new ServiceUnavailableException('api-gateway no disponible (circuit open)');
        throw err;
    }
}
