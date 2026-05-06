import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { RecordsModule } from './records/records.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './recilience/health/health.module';
import { BulkheadModule } from './recilience/bulkhead/bulkhead.module';
import { HttpBulkheadMiddleware } from './recilience/bulkhead/http-bulkhead.middleware';
import { ExternalClientEntity } from './clients/entities/external-client.entity';
import configuration from './config/configuration';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type:        'mysql',
                host:        config.get('db.host'),
                port:        config.get<number>('db.port'),
                username:    config.get('db.username'),
                password:    config.get('db.password'),
                database:    config.get('db.database'),
                entities:    [ExternalClientEntity],
                synchronize: config.get('app.env') !== 'production',
            }),
        }),
        BulkheadModule,
        GatewayModule,
        AuthModule,
        ClientsModule,
        RecordsModule,
        HealthModule,
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(HttpBulkheadMiddleware)
            // El endpoint de salud siempre debe responder, incluso bajo saturación
            .exclude({ path: 'health/status', method: RequestMethod.GET })
            .forRoutes('*');
    }
}
