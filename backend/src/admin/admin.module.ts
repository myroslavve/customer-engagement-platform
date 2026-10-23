import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminApiController } from './admin-api.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminApiController],
})
export class AdminModule {}
