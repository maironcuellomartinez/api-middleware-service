import * as dotenv from 'dotenv';
import * as path from 'path';

// Carga .env.<NODE_ENV> antes de que NestJS inicialice cualquier módulo
const env = process.env.NODE_ENV ?? 'development';
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

function validateConfig(): void {
    if (env === 'development') return;

    const required: Record<string, string> = {
        JWT_SECRET:     'Secret para firmar JWT de clientes externos',
        ABAC_M2M_TOKEN: 'Token M2M para autenticarse ante el api-gateway',
        ADMIN_API_KEY:  'API key para endpoints de administración (/clients)',
    };

    const invalid = Object.entries(required).filter(
        ([key]) => !process.env[key] || process.env[key] === 'CHANGE_ME'
                    || process.env[key] === 'middleware-jwt-secret-change-in-prod',
    );

    if (invalid.length > 0) {
        const lines = invalid.map(([key, desc]) => `  • ${key} — ${desc}`).join('\n');
        throw new Error(
            `Variables de entorno requeridas no configuradas:\n${lines}\n` +
            `Revisa el archivo .env.${env} antes de iniciar el servicio.`,
        );
    }
}

async function bootstrap() {
    try {
        validateConfig();
    } catch (err: any) {
        console.error(`\n[Bootstrap] ${err.message}\n`);
        process.exit(1);
    }

    const app = await NestFactory.create(AppModule);
    const logger = new Logger('Bootstrap');

    // CORS: abierto en development, restringido a orígenes explícitos en staging/production
    app.enableCors(
        env === 'development'
            ? {}
            : { origin: process.env.CORS_ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) ?? [] },
    );

    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

    // Swagger solo en entornos no productivos
    if (env !== 'production') {
        const config = new DocumentBuilder()
            .setTitle('API Middleware Service')
            .setDescription('Proxy OAuth2 para aplicaciones externas → Event Corner')
            .setVersion('1.0')
            .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
            .addApiKey({ type: 'apiKey', name: 'x-admin-api-key', in: 'header' }, 'admin-key')
            .addTag('Auth', 'OAuth2 client credentials')
            .addTag('Clients', 'Gestión de aplicaciones externas registradas')
            .addTag('Records', 'Consulta de solicitudes')
            .addTag('Health', 'Estado del servicio — sin autenticación')
            .build();

        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('docs', app, document);
        logger.log('Swagger disponible en /docs');
    }

    const port = process.env.PORT ?? 3007;
    await app.listen(port);
    logger.log(`api-middleware-service [${env}] corriendo en puerto ${port}`);
}
bootstrap();
