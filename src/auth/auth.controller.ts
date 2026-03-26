import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';

@ApiTags('Auth')
@Controller('oauth')
export class AuthController {
    constructor(private readonly service: AuthService) {}

    @Post('token')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Obtener access token (OAuth2 client_credentials)' })
    @ApiResponse({ status: 200, description: 'Token JWT emitido', type: TokenResponseDto })
    @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
    issueToken(@Body() dto: TokenRequestDto): Promise<TokenResponseDto> {
        return this.service.issueToken(dto);
    }
}
