import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class TokenRequestDto {
    @ApiProperty({ example: 'client_credentials' })
    @IsString() @IsIn(['client_credentials'])
    grant_type: string;

    @ApiProperty({ example: 'mc_abc123...' })
    @IsString() @IsNotEmpty()
    client_id: string;

    @ApiProperty({ example: 'secret...' })
    @IsString() @IsNotEmpty()
    client_secret: string;
}

export class TokenResponseDto {
    access_token: string;
    token_type:   string;
    expires_in:   number;
    client_name:  string;
}
