import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { RecordsModule } from './records/records.module';
import { GatewayModule } from './gateway/gateway.module';
import { ExternalClientEntity } from './clients/entities/external-client.entity';
import configuration from './config/configuration';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'mysql',
                host:     config.get('db.host'),
                port:     config.get<number>('db.port'),
                username: config.get('db.username'),
                password: config.get('db.password'),
                database: config.get('db.database'),
                entities:    [ExternalClientEntity],
                synchronize: config.get('app.env') !== 'production',
            }),
        }),
        GatewayModule,
        AuthModule,
        ClientsModule,
        RecordsModule,
    ],
})
export class AppModule {}
