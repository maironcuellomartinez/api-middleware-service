import { Controller, Post, Body, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { OAuthBulkheadGuard } from './guards/oauth-bulkhead.guard';

@ApiTags('Auth')
@Controller('oauth')
export class AuthController {
    constructor(private readonly service: AuthService) {}

    @Post('token')
    @HttpCode(HttpStatus.OK)
    @UseGuards(OAuthBulkheadGuard)
    @ApiOperation({ summary: 'Obtener access token (OAuth2 client_credentials)' })
    @ApiResponse({ status: 200, description: 'Token JWT emitido', type: TokenResponseDto })
    @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
    @ApiResponse({ status: 429, description: 'Demasiados intentos — bulkhead saturado' })
    async issueToken(@Body() dto: TokenRequestDto, @Req() req: Request): Promise<TokenResponseDto> {
        const bulkhead = (req as any).__oauthBulkhead;
        if (bulkhead) {
            return bulkhead.execute(() => this.service.issueToken(dto));
        }
        return this.service.issueToken(dto);
    }
}
