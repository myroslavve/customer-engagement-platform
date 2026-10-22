import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { QueuesModule } from './queues/queues.module';

@Module({
  imports: [ConfigModule, DatabaseModule, QueuesModule],
})
export class WorkerModule {}
