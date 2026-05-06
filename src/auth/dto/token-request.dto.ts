import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional } from 'class-validator';

export class TokenRequestDto {
    @ApiProperty({ example: 'client_credentials' })
    @IsString() @IsIn(['client_credentials'])
    grant_type: string;

    @ApiProperty({ example: 'read write admin', required: false, description: 'Scope(s) solicitados separados por espacio' })
    @IsString()
    @IsOptional()
    scope?: string;
}

export class TokenResponseDto {
    access_token: string;
    token_type:   string;
    expires_in:   number;
    client_name:  string;
    scope?:       string[];
}
