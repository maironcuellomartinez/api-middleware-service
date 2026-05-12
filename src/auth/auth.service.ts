import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ClientsService } from '../clients/clients.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { RefreshTokenRequestDto, RefreshTokenResponseDto } from './dto/refresh-token.dto';
import { RefreshTokenEntity } from './entities/refresh-token.entity';

const REFRESH_TOKEN_EXPIRATION_SECONDS = 7 * 24 * 3600; // 7 dias
const MIN_TOKEN_EXPIRATION = 3600; // 1 hora
const MAX_TOKEN_EXPIRATION = 7 * 24 * 3600; // 7 dias

@Injectable()
export class AuthService {
    constructor(
        private readonly clients: ClientsService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
        @InjectRepository(RefreshTokenEntity)
        private readonly refreshRepo: Repository<RefreshTokenEntity>,
    ) { }

    async issueToken(
        clientId: string,
        clientSecret: string,
        dto: TokenRequestDto,
    ): Promise<TokenResponseDto> {
        const client = await this.clients.validateCredentials(clientId, clientSecret);
        if (!client) throw new UnauthorizedException('Credenciales invalidas');

        // Usar la duracion configurada por cliente, con limites
        const clientExpiresIn = client.tokenExpiresInSeconds ?? 3600;
        const expiresIn = Math.min(
            Math.max(clientExpiresIn, MIN_TOKEN_EXPIRATION),
            MAX_TOKEN_EXPIRATION,
        );

        const requestedScopes = dto.scope
            ? dto.scope.split(' ').filter(Boolean)
            : [];

        let grantedScopes: string[] | undefined;
        if (requestedScopes.length > 0) {
            grantedScopes = client.allowedScopes
                ? requestedScopes.filter(s => client.allowedScopes!.includes(s))
                : requestedScopes;
        } else if (client.allowedScopes && client.allowedScopes.length > 0) {
            grantedScopes = client.allowedScopes;
        }

        const payload: Record<string, any> = {
            sub: client.clientId,
            type: 'external_client',
            clientName: client.name,
        };

        if (grantedScopes) {
            payload.scope = grantedScopes;
        }

        const access_token = this.jwt.sign(payload, { expiresIn });

        // Emitir refresh token
        const refresh_token = await this.issueRefreshToken(client.clientId);

        return {
            access_token,
            refresh_token,
            token_type: 'Bearer',
            expires_in: expiresIn,
            client_name: client.name,
            ...(grantedScopes ? { scope: grantedScopes } : {}),
        };
    }

    async refreshToken(dto: RefreshTokenRequestDto): Promise<RefreshTokenResponseDto> {
        // Verificar firma del refresh token JWT
        let payload: any;
        try {
            payload = this.jwt.verify(dto.refresh_token);
        } catch {
            throw new UnauthorizedException('Refresh token invalido o expirado');
        }

        if (payload.type !== 'refresh_token' || !payload.sub || !payload.jti) {
            throw new UnauthorizedException('Refresh token malformado');
        }

        const clientId = payload.sub;
        const jti = payload.jti;

        // Buscar el refresh token en BD por lookup exacto del jti
        const jtiHash = crypto.createHash('sha256').update(jti).digest('hex');
        const storedToken = await this.refreshRepo.findOne({
            where: { clientId, jtiHash, revokedAt: IsNull() },
        });

        if (!storedToken) {
            throw new UnauthorizedException('Refresh token revocado o no encontrado');
        }

        // Verificar que el hash coincida
        const hashMatch = await bcrypt.compare(jti, storedToken.tokenHash);
        if (!hashMatch) {
            // Posible reuse attack — revocar todos los tokens del cliente
            await this.revokeAllClientTokens(clientId);
            throw new UnauthorizedException('Refresh token invalido — todos los tokens han sido revocados');
        }

        if (storedToken.expiresAt < new Date()) {
            throw new UnauthorizedException('Refresh token expirado');
        }

        // Revocar el token actual (rotation)
        storedToken.revokedAt = new Date();
        await this.refreshRepo.save(storedToken);

        // Obtener el cliente para el nuevo token
        const client = await this.clients.findOne(clientId);

        // Emitir nuevo access token con la duracion del cliente
        const clientExpiresIn = client.tokenExpiresInSeconds ?? 3600;
        const expiresIn = Math.min(
            Math.max(clientExpiresIn, MIN_TOKEN_EXPIRATION),
            MAX_TOKEN_EXPIRATION,
        );

        const accessPayload: Record<string, any> = {
            sub: client.clientId,
            type: 'external_client',
            clientName: client.name,
        };

        const access_token = this.jwt.sign(accessPayload, { expiresIn });

        // Emitir nuevo refresh token
        const refresh_token = await this.issueRefreshToken(client.clientId);

        return {
            access_token,
            refresh_token,
            token_type: 'Bearer',
            expires_in: expiresIn,
            client_name: client.name,
        };
    }

    private async issueRefreshToken(clientId: string): Promise<string> {
        const jti = crypto.randomUUID();
        const expiresAt = new Date(
            Date.now() + REFRESH_TOKEN_EXPIRATION_SECONDS * 1000,
        );

        const tokenHash = await bcrypt.hash(jti, 10);
        const jtiHash = crypto.createHash('sha256').update(jti).digest('hex');

        const entity = this.refreshRepo.create({
            clientId,
            tokenHash,
            jtiHash,
            expiresAt,
        });
        await this.refreshRepo.save(entity);

        // Firmar el refresh token como JWT
        return this.jwt.sign(
            {
                sub: clientId,
                type: 'refresh_token',
                jti,
            },
            { expiresIn: REFRESH_TOKEN_EXPIRATION_SECONDS },
        );
    }

    private async revokeAllClientTokens(clientId: string): Promise<void> {
        await this.refreshRepo.update(
            { clientId, revokedAt: IsNull() },
            { revokedAt: new Date() },
        );
    }
}
