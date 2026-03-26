import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const logger = new Logger('Bootstrap');

    app.enableCors();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

    const config = new DocumentBuilder()
        .setTitle('API Middleware Service')
        .setDescription('Proxy OAuth2 para aplicaciones externas → Event Corner')
        .setVersion('1.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
        .addTag('Auth', 'OAuth2 client credentials')
        .addTag('Clients', 'Gestión de aplicaciones externas registradas')
        .addTag('Records', 'Consulta de incidencias y solicitudes')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    const port = process.env.PORT ?? 3007;
    await app.listen(port);
    logger.log(`api-middleware-service corriendo en puerto ${port}`);
}
bootstrap();
