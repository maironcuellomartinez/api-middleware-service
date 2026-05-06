import {
    Controller, Post, Body, Req, HttpCode, HttpStatus,
    UseGuards, UnauthorizedException, Headers, HttpException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBasicAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { OAuthBulkheadGuard } from './guards/oauth-bulkhead.guard';
import { BulkheadRejectedError, BulkheadTimeoutError } from '../recilience/bulkhead/bulkhead';

@ApiTags('Auth')
@Controller('oauth')
export class AuthController {
    constructor(private readonly service: AuthService) {}

    @Post('token')
    @HttpCode(HttpStatus.OK)
    @UseGuards(OAuthBulkheadGuard)
    @ApiBasicAuth()
    @ApiOperation({ summary: 'Obtener access token (OAuth2 client_credentials)' })
    @ApiResponse({ status: 200, description: 'Token JWT emitido', type: TokenResponseDto })
    @ApiResponse({ status: 401, description: 'Credenciales invalidas' })
    @ApiResponse({ status: 429, description: 'Demasiados intentos — bulkhead saturado' })
    async issueToken(
        @Body() dto: TokenRequestDto,
        @Req() req: Request,
        @Headers('authorization') authHeader?: string,
    ): Promise<TokenResponseDto> {
        const basic = this.extractBasicCredentials(authHeader);
        if (!basic) {
            throw new UnauthorizedException('Credenciales requeridas via Basic Auth');
        }

        if (!basic.client_id.startsWith('mc_')) {
            throw new UnauthorizedException('Formato de client_id invalido — debe comenzar con mc_');
        }

        const bulkhead = (req as any).__oauthBulkhead;
        const call = () => this.service.issueToken(basic.client_id, basic.client_secret, dto);
        if (bulkhead) {
            try {
                return await bulkhead.execute(call);
            } catch (error) {
                if (error instanceof BulkheadRejectedError) {
                    throw new HttpException(
                        {
                            statusCode: 429,
                            error:      'Too Many Requests',
                            message:    'Demasiados intentos de autenticacion. Intente nuevamente en unos segundos.',
                        },
                        429,
                    );
                }
                if (error instanceof BulkheadTimeoutError) {
                    throw new HttpException(
                        {
                            statusCode: 408,
                            error:      'Request Timeout',
                            message:    'El servidor esta procesando demasiadas solicitudes de autenticacion.',
                        },
                        408,
                    );
                }
                throw error;
            }
        }
        return call();
    }

    private extractBasicCredentials(authHeader?: string): { client_id: string; client_secret: string } | null {
        if (!authHeader) return null;

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0].toLowerCase() !== 'basic') {
            return null;
        }

        try {
            const decoded = Buffer.from(parts[1], 'base64').toString('utf-8');
            const colonIndex = decoded.indexOf(':');
            if (colonIndex === -1) return null;

            const client_id = decoded.substring(0, colonIndex);
            const client_secret = decoded.substring(colonIndex + 1);

            if (!client_id || !client_secret) return null;

            return { client_id, client_secret };
        } catch {
            return null;
        }
    }
}
