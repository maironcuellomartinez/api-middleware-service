const DEV_FALLBACK_PREFIX = 'dev-only--';

/**
 * Valida que una variable de entorno requerida este configurada.
 * En produccion/staging, lanza error si falta o si tiene valor de desarrollo.
 * En desarrollo, usa el fallback provisto.
 */
function requiredSecret(key: string, fallback: string): string {
    const env = process.env.NODE_ENV ?? 'development';
    const value = process.env[key];

    if (env !== 'development') {
        if (!value) {
            throw new Error(
                `Variable de entorno requerida '${key}' no configurada. ` +
                `Revisa .env.${env} antes de iniciar el servicio.`,
            );
        }
        if (value.startsWith(DEV_FALLBACK_PREFIX)) {
            throw new Error(
                `Variable de entorno '${key}' tiene un valor de desarrollo ('${value}'). ` +
                `Configura un valor real para el entorno '${env}'.`,
            );
        }
        return value;
    }

    return value ?? fallback;
}

export default () => {
    const env = process.env.NODE_ENV ?? 'development';

    return {
        app: {
            port: parseInt(process.env.PORT ?? '3007', 10),
            env,
        },
        db: {
            host: process.env.DB_HOST ?? 'localhost',
            port: parseInt(process.env.DB_PORT ?? '3306', 10),
            username: process.env.DB_USERNAME ?? 'root',
            password: process.env.DB_PASSWORD ?? 'root',
            database: process.env.DB_DATABASE ?? 'middleware_db',
        },
        jwt: {
            secret: requiredSecret('JWT_SECRET', 'dev-only--replace-in-staging-and-production'),
            expiration: parseInt(process.env.JWT_EXPIRATION ?? '3600', 10),
        },
        admin: {
            apiKey:        process.env.ADMIN_API_KEY ?? 'dev-only--replace-in-staging-and-production',
            user:          process.env.ADMIN_USER ?? '',
            passHash:      process.env.ADMIN_PASS_HASH ?? '',
            sessionSecret: requiredSecret('ADMIN_SESSION_SECRET', 'dev-only--replace-in-staging-and-production'),
        },
        gateway: {
            url: process.env.API_GATEWAY_URL ?? 'http://localhost:3000',
            m2mToken: process.env.ABAC_M2M_TOKEN ?? 'dev-only--replace-in-staging-and-production',
        },
        bulkhead: {
            http: {
                concurrency: parseInt(process.env.HTTP_BULKHEAD_CONCURRENCY ?? '50', 10),
                maxQueueSize: parseInt(process.env.HTTP_BULKHEAD_MAX_QUEUE ?? '100', 10),
            },
        },
    };
};
