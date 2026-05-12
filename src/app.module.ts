import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { RecordsModule } from './records/records.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './recilience/health/health.module';
import { AdminModule } from './admin/admin.module';
import { BulkheadModule } from './recilience/bulkhead/bulkhead.module';
import { HttpBulkheadMiddleware } from './recilience/bulkhead/http-bulkhead.middleware';
import { HttpLoggerMiddleware } from './common/http-logger.middleware';
import { ExternalClientEntity } from './clients/entities/external-client.entity';
import { AdminEntity } from './admin/entities/admin.entity';
import { RefreshTokenEntity } from './auth/entities/refresh-token.entity';
import configuration from './config/configuration';

@Module({
    imports: [
        ScheduleModule.forRoot(),
        ThrottlerModule.forRoot([{
            name: 'global',
            ttl: 60000,
            limit: 100,
        }]),
        ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            envFilePath: ['.env.development', '.env'],
        }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type:        'mysql',
                host:        config.get('db.host'),
                port:        config.get<number>('db.port'),
                username:    config.get('db.username'),
                password:    config.get('db.password'),
                database:    config.get('db.database'),
                entities:    [ExternalClientEntity, AdminEntity, RefreshTokenEntity],
                synchronize: config.get('app.env') === 'development',
            }),
        }),
        BulkheadModule,
        GatewayModule,
        AuthModule,
        ClientsModule,
        RecordsModule,
        HealthModule,
        AdminModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(HttpLoggerMiddleware)
            .exclude({ path: 'health/ping', method: RequestMethod.GET })
            .forRoutes('*');

        consumer
            .apply(HttpBulkheadMiddleware)
            .exclude({ path: 'health/status', method: RequestMethod.GET })
            .forRoutes('*');
    }
}
