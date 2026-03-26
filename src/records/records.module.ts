import { Module } from '@nestjs/common';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';
import { GatewayModule } from '../gateway/gateway.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports:     [GatewayModule, AuthModule],
    controllers: [RecordsController],
    providers:   [RecordsService],
})
export class RecordsModule {}
