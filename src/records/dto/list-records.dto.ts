import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListRequestsDto {
    @ApiPropertyOptional({ description: 'Estado(s) separados por coma', example: 'CREATED,IN_PROGRESS' })
    @IsOptional() @IsString()
    status?: string;

    @ApiPropertyOptional({ example: 'uuid-issue-type' })
    @IsOptional() @IsString()
    issueTypeId?: string;

    @ApiPropertyOptional({ example: 'uuid-corner' })
    @IsOptional() @IsString()
    cornerId?: string;

    @ApiPropertyOptional({ example: 'uuid-company' })
    @IsOptional() @IsString()
    companyId?: string;

    @ApiPropertyOptional({ example: '2026-01-01' })
    @IsOptional() @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2026-12-31' })
    @IsOptional() @IsString()
    dateTo?: string;

    @ApiPropertyOptional({ example: 1, default: 1 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1)
    page?: number = 1;

    @ApiPropertyOptional({ example: 20, default: 20 })
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
    limit?: number = 20;
}
