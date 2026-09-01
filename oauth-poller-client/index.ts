/**
 * Cliente OAuth2 (client_credentials) para api-middleware-service.
 *
 * Se autentica contra POST /oauth/token, mantiene el access_token vigente
 * (renovandolo via POST /oauth/refresh antes de que expire, o reautenticando
 * si el refresh falla) y ejecuta un lote de consultas de ejemplo cada
 * POLL_INTERVAL_MS (default 5 minutos) contra los endpoints de /v1.
 *
 * Uso:
 *   1. Copiar .env.example a .env (dentro de esta carpeta) y completar valores.
 *   2. npm run poller:start (desde la raiz del repo)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

import * as fs from 'fs';
import axios, { AxiosInstance, AxiosError } from 'axios';

interface Config {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    scope?: string;
    pollIntervalMs: number;
}

function loadConfig(): Config {
    const baseUrl = process.env.MW_BASE_URL;
    const clientId = process.env.MW_CLIENT_ID;
    const clientSecret = process.env.MW_CLIENT_SECRET;

    if (!baseUrl || !clientId || !clientSecret) {
        throw new Error(
            'Faltan variables de entorno requeridas: MW_BASE_URL, MW_CLIENT_ID, MW_CLIENT_SECRET '
            + '(ver oauth-poller-client/.env.example)',
        );
    }

    return {
        baseUrl: baseUrl.replace(/\/+$/, ''),
        clientId,
        clientSecret,
        scope: process.env.MW_SCOPE,
        pollIntervalMs: Number(process.env.MW_POLL_INTERVAL_MS ?? 5 * 60_000),
    };
}

interface TokenState {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
}

/** Cliente OAuth2 client_credentials con refresh automatico. */
class OAuth2Client {
    private http: AxiosInstance;
    private token: TokenState | null = null;
    private inFlightRefresh: Promise<TokenState> | null = null;

    constructor(private readonly config: Config) {
        this.http = axios.create({ baseURL: config.baseUrl, timeout: 15_000 });
    }

    private basicAuthHeader(): string {
        const raw = `${this.config.clientId}:${this.config.clientSecret}`;
        return `Basic ${Buffer.from(raw, 'utf-8').toString('base64')}`;
    }

    private async issueToken(): Promise<TokenState> {
        const { data } = await this.http.post(
            '/oauth/token',
            { grant_type: 'client_credentials', scope: this.config.scope },
            { headers: { Authorization: this.basicAuthHeader() } },
        );

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            // Renovar 60s antes de que expire para dar margen de red.
            expiresAt: Date.now() + Math.max(data.expires_in - 60, 30) * 1000,
        };
    }

    private async refreshToken(refreshToken: string): Promise<TokenState> {
        const { data } = await this.http.post('/oauth/refresh', { refresh_token: refreshToken });

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + Math.max(data.expires_in - 60, 30) * 1000,
        };
    }

    /** Devuelve un access_token vigente, renovando o reautenticando si hace falta. */
    async getAccessToken(): Promise<string> {
        if (this.token && this.token.expiresAt > Date.now()) {
            return this.token.accessToken;
        }

        if (this.inFlightRefresh) {
            return (await this.inFlightRefresh).accessToken;
        }

        this.inFlightRefresh = (async () => {
            try {
                if (this.token?.refreshToken) {
                    return await this.refreshToken(this.token.refreshToken);
                }
                return await this.issueToken();
            } catch {
                // El refresh token puede haber expirado o ser invalido: reautenticar desde cero.
                return this.issueToken();
            } finally {
                this.inFlightRefresh = null;
            }
        })();

        this.token = await this.inFlightRefresh;
        return this.token.accessToken;
    }

    /** Fuerza reautenticacion completa (usado tras un 401 inesperado). */
    async forceReauthenticate(): Promise<string> {
        this.token = null;
        return this.getAccessToken();
    }

    /** GET autenticado con reintento unico ante 401. */
    async get<T = unknown>(url: string, params: Record<string, unknown>): Promise<T> {
        const token = await this.getAccessToken();

        try {
            const { data } = await this.http.get<T>(url, {
                params,
                headers: { Authorization: `Bearer ${token}` },
            });
            return data;
        } catch (err) {
            if (err instanceof AxiosError && err.response?.status === 401) {
                const retryToken = await this.forceReauthenticate();
                const { data } = await this.http.get<T>(url, {
                    params,
                    headers: { Authorization: `Bearer ${retryToken}` },
                });
                return data;
            }
            throw err;
        }
    }
}

interface DateWindow {
    dateFrom: string;
    dateTo: string;
}

/**
 * El sistema origen no tiene datos validos antes de esta fecha: ninguna
 * consulta debe pedir un dateFrom anterior (equivalente al piso que valida
 * el startDate en el sistema externo).
 */
export const MIN_VALID_DATE = new Date('2026-07-16T08:00:00.000Z');

export function buildWindow(minutesBack: number, now = new Date()): DateWindow {
    const end = now.getTime() < MIN_VALID_DATE.getTime() ? MIN_VALID_DATE : now;
    const rawStart = new Date(end.getTime() - minutesBack * 60_000);
    const start = rawStart.getTime() < MIN_VALID_DATE.getTime() ? MIN_VALID_DATE : rawStart;

    return {
        dateFrom: start.toISOString().slice(0, 10),
        dateTo: end.toISOString().slice(0, 10),
    };
}

interface QueryJob {
    name: string;
    run: (client: OAuth2Client, window: DateWindow) => Promise<unknown>;
}

/**
 * Lote de consultas contra /v1/requests. Ajustar params segun lo que
 * necesite consumir cada integracion (ver src/records/dto/list-records.dto.ts
 * para el listado completo de filtros soportados).
 */
const QUERIES: QueryJob[] = [
    {
        name: 'requests (dateFrom/dateTo, hoy, estado CREATED,IN_PROGRESS)',
        run: (client, w) => client.get('/v1/requests', {
            dateFrom: w.dateFrom,
            dateTo: w.dateTo,
            status: 'CREATED,IN_PROGRESS',
            page: 1,
            limit: 20,
        }),
    },
];

/**
 * Log de cada peticion (no del objeto de negocio que devuelve): timestamp,
 * query, params, resultado, duracion y — si fallo — status/mensaje del error.
 * Se persiste en archivo para poder revisar el historial completo despues de
 * dejar el script corriendo desatendido (ej: para atrapar el error de las 12
 * de la noche).
 */
const LOG_FILE = path.resolve(__dirname, 'logs', 'poller.log');

function logEntry(entry: {
    query: string;
    params: object;
    ok: boolean;
    durationMs: number;
    resultCount?: number;
    status?: number;
    message?: string;
}): void {
    const line = [
        `[${new Date().toISOString()}]`,
        entry.ok ? 'OK   ' : 'ERROR',
        entry.query,
        `params=${JSON.stringify(entry.params)}`,
        `duration=${entry.durationMs}ms`,
        entry.resultCount !== undefined ? `count=${entry.resultCount}` : null,
        entry.status !== undefined ? `status=${entry.status}` : null,
        entry.message ? `message=${entry.message}` : null,
    ].filter(Boolean).join(' ');

    if (entry.ok) console.log(line); else console.error(line);

    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
}

async function runQueries(client: OAuth2Client, pollIntervalMs: number): Promise<void> {
    const minutesBack = Math.ceil(pollIntervalMs / 60_000);
    const window = buildWindow(minutesBack);

    for (const query of QUERIES) {
        const startedAt = Date.now();
        try {
            const result = await query.run(client, window);
            const count = Array.isArray(result)
                ? result.length
                : Array.isArray((result as any)?.data)
                    ? (result as any).data.length
                    : undefined;

            logEntry({
                query: query.name,
                params: window,
                ok: true,
                durationMs: Date.now() - startedAt,
                resultCount: count,
            });
        } catch (err) {
            const status = err instanceof AxiosError ? err.response?.status : undefined;
            const message = err instanceof AxiosError
                ? JSON.stringify(err.response?.data ?? err.code ?? err.message ?? 'error de red sin detalle')
                : String(err);

            logEntry({
                query: query.name,
                params: window,
                ok: false,
                durationMs: Date.now() - startedAt,
                status,
                message,
            });
        }
    }
}

async function main(): Promise<void> {
    const config = loadConfig();
    const client = new OAuth2Client(config);

    console.log(
        `Iniciando poller contra ${config.baseUrl} `
        + `(cada ${Math.round(config.pollIntervalMs / 1000)}s, client_id=${config.clientId})`,
    );

    // Cada query ya atrapa sus propios errores en logEntry(); este catch es
    // solo una red de seguridad para que un fallo no previsto no tumbe el
    // proceso mientras corre desatendido.
    const tick = () => {
        runQueries(client, config.pollIntervalMs).catch((err) => {
            logEntry({
                query: 'runQueries (fallo inesperado, ver stack en logs/poller.log)',
                params: {},
                ok: false,
                durationMs: 0,
                message: err instanceof Error ? err.stack ?? err.message : String(err),
            });
        });
    };

    await tick();
    const timer = setInterval(tick, config.pollIntervalMs);

    process.on('unhandledRejection', (reason) => {
        logEntry({ query: 'unhandledRejection', params: {}, ok: false, durationMs: 0, message: String(reason) });
    });
    process.on('uncaughtException', (err) => {
        logEntry({ query: 'uncaughtException', params: {}, ok: false, durationMs: 0, message: err.stack ?? err.message });
    });

    const shutdown = () => {
        console.log('\nDeteniendo poller...');
        clearInterval(timer);
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

if (require.main === module) {
    main().catch((err) => {
        console.error('Fallo fatal al iniciar el poller:', err);
        process.exit(1);
    });
}
