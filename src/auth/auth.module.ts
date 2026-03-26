import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { ClientsModule } from '../clients/clients.module';

@Module({
    imports: [
        ClientsModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject:  [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret:      config.get('jwt.secret'),
                signOptions: { issuer: 'api-middleware-service', audience: 'external-clients' },
            }),
        }),
    ],
    controllers: [AuthController],
    providers:   [AuthService, AccessTokenGuard],
    exports:     [JwtModule, AccessTokenGuard],
})
export class AuthModule {}
