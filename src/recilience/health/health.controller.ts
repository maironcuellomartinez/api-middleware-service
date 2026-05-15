import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get('status')
    @ApiOperation({ summary: 'Estado del servicio con metricas de resiliencia (sin auth)' })
    async getStatus() {
        return this.healthService.getStatus();
    }

    @Get('ping')
    @ApiOperation({ summary: 'Ping liviano — solo verifica que el proceso esta vivo (sin auth)' })
    ping() {
        return this.healthService.getPing();
    }
}
