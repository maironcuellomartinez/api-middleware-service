import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { GatewayModule } from '../../gateway/gateway.module';
import { BulkheadModule } from '../bulkhead/bulkhead.module';

@Module({
    imports:     [GatewayModule, BulkheadModule],
    controllers: [HealthController],
})
export class HealthModule { }
