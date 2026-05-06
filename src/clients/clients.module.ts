import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalClientEntity } from './entities/external-client.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { AdminApiKeyGuard } from './guards/admin-api-key.guard';

@Module({
    imports: [TypeOrmModule.forFeature([ExternalClientEntity])],
    providers: [ClientsService, AdminApiKeyGuard],
    controllers: [ClientsController],
    exports: [ClientsService],
})
export class ClientsModule {}
