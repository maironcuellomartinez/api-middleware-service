import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { LogsService } from './logs.service';
import { LogsController } from './logs.controller';

@Module({
    imports: [AuthModule, AdminModule],
    providers: [LogsService],
    controllers: [LogsController],
    exports: [LogsService],
})
export class LogsModule {}
