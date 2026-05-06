import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { AdminApiKeyGuard } from './guards/admin-api-key.guard';

@ApiTags('Clients')
@ApiHeader({ name: 'x-admin-api-key', required: true, description: 'API key de administración' })
@UseGuards(AdminApiKeyGuard)
@Controller('clients')
export class ClientsController {
    constructor(private readonly service: ClientsService) {}

    @Post()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Registrar aplicación externa', description: 'Devuelve clientId y clientSecret (solo una vez).' })
    @ApiResponse({ status: 201 })
    create(@Body() dto: CreateClientDto) {
        return this.service.create(dto);
    }

    @Get()
    @ApiOperation({ summary: 'Listar aplicaciones registradas' })
    findAll() {
        return this.service.findAll();
    }

    @Get(':clientId')
    @ApiOperation({ summary: 'Detalle de aplicación' })
    @ApiParam({ name: 'clientId' })
    findOne(@Param('clientId') clientId: string) {
        return this.service.findOne(clientId);
    }

    @Patch(':clientId/rotate-secret')
    @ApiOperation({ summary: 'Rotar secret de una aplicación' })
    @ApiParam({ name: 'clientId' })
    rotateSecret(@Param('clientId') clientId: string) {
        return this.service.rotateSecret(clientId);
    }

    @Delete(':clientId')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Desactivar aplicación' })
    @ApiParam({ name: 'clientId' })
    deactivate(@Param('clientId') clientId: string) {
        return this.service.deactivate(clientId);
    }
}
