import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminOrAccessGuard } from '../auth/guards/admin-or-access.guard';
import { LogsService } from './logs.service';

@ApiTags('Logs')
@ApiBearerAuth('access-token')
@UseGuards(AdminOrAccessGuard)
@Controller('v1/logs')
export class LogsController {
    constructor(private readonly service: LogsService) {}

    @Get()
    @ApiOperation({ summary: 'Últimos logs de requests en memoria (max 50)' })
    findRecent(@Query('limit') limit?: string) {
        return this.service.findRecent(limit ? Math.min(Number(limit), 50) : 30);
    }
}
