import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientsService } from '../clients/clients.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly clients: ClientsService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) {}

    async issueToken(
        clientId: string,
        clientSecret: string,
        dto: TokenRequestDto,
    ): Promise<TokenResponseDto> {
        const client = await this.clients.validateCredentials(clientId, clientSecret);
        if (!client) throw new UnauthorizedException('Credenciales invalidas');

        const expiresIn = this.config.get<number>('jwt.expiration') ?? 3600;

        const scopes = dto.scope
            ? dto.scope.split(' ').filter(Boolean)
            : undefined;

        const payload: Record<string, any> = {
            sub:        client.clientId,
            type:       'external_client',
            clientName: client.name,
        };

        if (scopes) {
            payload.scope = scopes;
        }

        const access_token = this.jwt.sign(payload, { expiresIn });

        return {
            access_token,
            token_type: 'Bearer',
            expires_in: expiresIn,
            client_name: client.name,
            ...(scopes ? { scope: scopes } : {}),
        };
    }
}
