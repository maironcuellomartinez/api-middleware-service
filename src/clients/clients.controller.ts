import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';

/** Admin endpoints — in production protect with an admin token or IP allowlist */
@ApiTags('Clients')
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
