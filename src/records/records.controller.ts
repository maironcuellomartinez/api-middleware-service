import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RecordsService } from './records.service';
import { ListRecordsDto } from './dto/list-records.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';

@ApiTags('Records')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('v1')
export class RecordsController {
    constructor(private readonly service: RecordsService) {}

    @Get('incidents/:number')
    @ApiOperation({ summary: 'Obtener incidencia por número (ej: INC0001234)' })
    @ApiParam({ name: 'number', example: 'INC0001234' })
    @ApiResponse({ status: 200 }) @ApiResponse({ status: 404 })
    getIncidentByNumber(@Param('number') number: string) {
        return this.service.getIncidentByNumber(number);
    }

    @Get('requests/:number')
    @ApiOperation({ summary: 'Obtener solicitud por número (ej: REQ0001234)' })
    @ApiParam({ name: 'number', example: 'REQ0001234' })
    @ApiResponse({ status: 200 }) @ApiResponse({ status: 404 })
    getRequestByNumber(@Param('number') number: string) {
        return this.service.getRequestByNumber(number);
    }

    @Get('records')
    @ApiOperation({ summary: 'Listar incidencias y/o solicitudes con filtros' })
    @ApiResponse({ status: 200 })
    listRecords(@Query() query: ListRecordsDto) {
        return this.service.listRecords(query);
    }

    @Get('status')
    @ApiOperation({ summary: 'Estado del circuit breaker y bulkhead' })
    getStatus() {
        return this.service.getResilienceStatus();
    }
}
