export default () => ({
    app: {
        port: parseInt(process.env.PORT ?? '3007', 10),
        env:  process.env.NODE_ENV ?? 'development',
    },
    db: {
        host:     process.env.DB_HOST     ?? 'localhost',
        port:     parseInt(process.env.DB_PORT ?? '3306', 10),
        username: process.env.DB_USERNAME ?? 'root',
        password: process.env.DB_PASSWORD ?? 'root',
        database: process.env.DB_DATABASE ?? 'middleware_db',
    },
    jwt: {
        secret:     process.env.JWT_SECRET     ?? 'middleware-jwt-secret-change-in-prod',
        expiration: parseInt(process.env.JWT_EXPIRATION ?? '3600', 10),
    },
    admin: {
        apiKey: process.env.ADMIN_API_KEY ?? '',
    },
    gateway: {
        url:      process.env.API_GATEWAY_URL ?? 'http://localhost:3000',
        m2mToken: process.env.ABAC_M2M_TOKEN  ?? '',
    },
    bulkhead: {
        http: {
            concurrency:  parseInt(process.env.HTTP_BULKHEAD_CONCURRENCY ?? '50', 10),
            maxQueueSize: parseInt(process.env.HTTP_BULKHEAD_MAX_QUEUE    ?? '100', 10),
        },
    },
});
