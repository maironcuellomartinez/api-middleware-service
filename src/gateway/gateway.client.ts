import { Injectable, Logger, ServiceUnavailableException, NotFoundException, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import CircuitBreaker from 'opossum';
import PQueue from 'p-queue';

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

        // Bulkhead — concurrencia separada por tipo de operación
        this.highPriority = new PQueue({ concurrency: 10 });
        this.lowPriority = new PQueue({ concurrency: 5 });

        // Circuit breaker — envuelve el método interno de llamada HTTP
        this.breaker = new CircuitBreaker(
            (url: string, params?: Record<string, string>) => this._httpGet(url, params),
            {
                timeout: 5000,
                errorThresholdPercentage: 50,
                resetTimeout: 30000,
                volumeThreshold: 5,
                errorFilter: (err) => {
                    // 4xx no cuentan como falla de infraestructura
                    if (err instanceof AxiosError && err.response) {
                        return err.response.status < 500;
                    }
                    return false;
                },
            },
        );

        this.breaker.on('open', () => this.logger.warn('Circuit breaker OPEN — api-gateway no disponible'));
        this.breaker.on('halfOpen', () => this.logger.log('Circuit breaker HALF-OPEN — probando api-gateway'));
        this.breaker.on('close', () => this.logger.log('Circuit breaker CLOSED — api-gateway disponible'));
        this.breaker.fallback(() => { throw new ServiceUnavailableException('api-gateway no disponible (circuit open)'); });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    getRequestByNumber(number: string): Promise<unknown> {
        return this.highPriority.add(() =>
            this.breaker.fire(`${this.baseUrl}/internal-api/requests/by-number/${encodeURIComponent(number)}`),
        );
    }

    listRequests(params: Record<string, string>): Promise<unknown> {
        return this.lowPriority.add(() =>
            this.breaker.fire(`${this.baseUrl}/internal-api/requests`, params),
        );
    }

    // ── Métricas del estado de resiliencia ────────────────────────────────────
    getStatus() {
        return {
            circuitBreaker: {
                state: this.breaker.opened ? 'OPEN' : this.breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
                stats: this.breaker.stats,
            },
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
                this.http.get(url, { params, headers: this.headers }),
            );
            return response.data;
        } catch (err) {
            if (err instanceof AxiosError && err.response) {
                const status = err.response.status;
                if (status === 404) throw new NotFoundException('Recurso no encontrado');
                // Solo reenviamos el mensaje controlado, no la estructura completa del upstream
                const upstream = err.response.data;
                const message = typeof upstream?.message === 'string'
                    ? upstream.message
                    : `Error del api-gateway (${status})`;
                throw new HttpException(message, status);
            }
            throw err;
        }
    }
}
