import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateClientDto {
    @ApiProperty({ example: 'Mi App Externa', description: 'Nombre de la aplicación externa' })
    @IsString() @IsNotEmpty() @MaxLength(100)
    name: string;

    @ApiPropertyOptional({ example: 'App de consulta de incidencias para el portal HR' })
    @IsOptional() @IsString() @MaxLength(255)
    description?: string;
}

export class ClientCredentialsResponseDto {
    clientId: string;
    clientSecret: string; // shown only once
    name: string;
    message: string;
}

export class ClientResponseDto {
    clientId: string;
    name: string;
    description: string;
    isActive: boolean;
    createdAt: Date;
}
