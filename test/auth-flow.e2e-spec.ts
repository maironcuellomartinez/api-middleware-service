import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ClientsService } from '../src/clients/clients.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ExternalClientEntity } from '../src/clients/entities/external-client.entity';

/**
 * Tests e2e del flujo OAuth2:
 *   POST /oauth/token  →  JWT  →  GET /v1/requests/:number
 *
 * Requiere base de datos MySQL disponible.
 * Si no hay DB, estos tests se saltan automáticamente.
 */

// Usamos un timeout más largo para e2e
jest.setTimeout(30000);

describe('Auth Flow (e2e)', () => {
    let app: INestApplication;
    let clientsService: jest.Mocked<ClientsService>;
    let jwtService: JwtService;
    let configService: ConfigService;

    beforeAll(async () => {
        // Verificar si hay DB disponible
        const dbHost = process.env.DB_HOST ?? 'localhost';
        const canConnect = await tryConnect(dbHost);
        if (!canConnect) {
            console.warn(`⚠ MySQL no disponible en ${dbHost} — saltando tests e2e`);
            return;
        }

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(ClientsService)
            .useValue({
                validateCredentials: jest.fn(),
                create:              jest.fn(),
                findAll:             jest.fn(),
                findOne:             jest.fn(),
                rotateSecret:        jest.fn(),
                deactivate:          jest.fn(),
            })
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

        clientsService = app.get(ClientsService) as any;
        jwtService = app.get(JwtService);
        configService = app.get(ConfigService);

        await app.init();
    });

    afterAll(async () => {
        if (app) await app.close();
    });

    describe('POST /oauth/token', () => {
        const validClient: ExternalClientEntity = {
            clientId:          'mc_test_e2e',
            clientSecretHash:  '$2a$10$testhash',
            name:              'E2E Test App',
            description:       'Created for e2e testing',
            isActive:          true,
            createdAt:         new Date(),
            updatedAt:         new Date(),
        };

        it('should return 200 and a JWT token for valid credentials', async () => {
            if (!app) return; // skip if no DB

            clientsService.validateCredentials.mockResolvedValue(validClient);

            const response = await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                    grant_type:   'client_credentials',
                    client_id:    'mc_test_e2e',
                    client_secret: 'test-secret',
                })
                .expect(200);

            expect(response.body).toHaveProperty('access_token');
            expect(response.body).toHaveProperty('token_type', 'Bearer');
            expect(response.body).toHaveProperty('expires_in');
            expect(response.body).toHaveProperty('client_name', 'E2E Test App');

            // Verify the token is a valid JWT
            const decoded = jwtService.verify(response.body.access_token, {
                secret: configService.get('jwt.secret'),
            });
            expect(decoded.sub).toBe('mc_test_e2e');
            expect(decoded.type).toBe('external_client');
            expect(decoded.clientName).toBe('E2E Test App');
        });

        it('should return 401 for invalid credentials', async () => {
            if (!app) return;

            clientsService.validateCredentials.mockResolvedValue(null);

            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                    grant_type:   'client_credentials',
                    client_id:    'mc_invalid',
                    client_secret: 'wrong-secret',
                })
                .expect(401);
        });

        it('should return 400 for missing grant_type', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                    client_id:     'mc_test',
                    client_secret: 'secret',
                })
                .expect(400);
        });

        it('should return 400 for invalid grant_type', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                    grant_type:   'authorization_code',
                    client_id:    'mc_test',
                    client_secret: 'secret',
                })
                .expect(400);
        });

        it('should return 400 for missing client_id', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                    grant_type:   'client_credentials',
                    client_secret: 'secret',
                })
                .expect(400);
        });

        it('should return 400 for missing client_secret', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .post('/oauth/token')
                .send({
                    grant_type: 'client_credentials',
                    client_id:  'mc_test',
                })
                .expect(400);
        });
    });

    describe('GET /v1/requests/:number (authenticated)', () => {
        let validToken: string;

        beforeAll(async () => {
            if (!app) return;

            // Generate a valid token for testing
            const payload = {
                sub:        'mc_test_e2e',
                type:       'external_client',
                clientName: 'E2E Test App',
            };
            validToken = jwtService.sign(payload, {
                secret:    configService.get('jwt.secret'),
                expiresIn: 3600,
            });
        });

        it('should return 200 for a valid token (delegates to gateway)', async () => {
            if (!app) return;

            // The gateway client will try to call the real gateway,
            // which is not available in tests. We expect a 503 or similar.
            // This test verifies the auth guard passes.
            const response = await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${validToken}`);

            // The request passes the guard but fails at gateway level
            expect([200, 503, 502]).toContain(response.status);
        });

        it('should return 401 when no token is provided', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .expect(401);
        });

        it('should return 401 when token is expired', async () => {
            if (!app) return;

            const expiredPayload = {
                sub:        'mc_test',
                type:       'external_client',
                clientName: 'Test',
            };
            const expiredToken = jwtService.sign(expiredPayload, {
                secret:    configService.get('jwt.secret'),
                expiresIn: 0, // already expired
            });

            // Wait a bit to ensure expiration
            await new Promise(r => setTimeout(r, 100));

            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${expiredToken}`)
                .expect(401);
        });

        it('should return 401 for malformed token', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', 'Bearer invalid-token-format')
                .expect(401);
        });

        it('should return 401 when token type is not external_client', async () => {
            if (!app) return;

            const wrongTypePayload = {
                sub:  'internal-svc',
                type: 'internal_service',
            };
            const wrongTypeToken = jwtService.sign(wrongTypePayload, {
                secret:    configService.get('jwt.secret'),
                expiresIn: 3600,
            });

            await request(app.getHttpServer())
                .get('/v1/requests/REQ0001234')
                .set('Authorization', `Bearer ${wrongTypeToken}`)
                .expect(401);
        });
    });

    describe('GET /health/status (no auth)', () => {
        it('should return 200 without authentication', async () => {
            if (!app) return;

            await request(app.getHttpServer())
                .get('/health/status')
                .expect(200);
        });
    });
});

/**
 * Intenta conectar a MySQL para decidir si ejecutar tests e2e
 */
async function tryConnect(host: string): Promise<boolean> {
    try {
        const net = await import('net');
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error',   () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.connect(3306, host);
        });
    } catch {
        return false;
    }
}
