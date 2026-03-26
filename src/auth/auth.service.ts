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

    async issueToken(dto: TokenRequestDto): Promise<TokenResponseDto> {
        const client = await this.clients.validateCredentials(dto.client_id, dto.client_secret);
        if (!client) throw new UnauthorizedException('Credenciales inválidas');

        const expiresIn = this.config.get<number>('jwt.expiration') ?? 3600;

        const payload = {
            sub:        client.clientId,
            type:       'external_client',
            clientName: client.name,
        };

        const access_token = this.jwt.sign(payload, { expiresIn });

        return { access_token, token_type: 'Bearer', expires_in: expiresIn, client_name: client.name };
    }
}
