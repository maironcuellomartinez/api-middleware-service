import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalClientEntity } from './entities/external-client.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
    imports: [TypeOrmModule.forFeature([ExternalClientEntity])],
    providers: [ClientsService],
    controllers: [ClientsController],
    exports: [ClientsService],
})
export class ClientsModule {}
