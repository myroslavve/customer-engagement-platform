import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { DatabaseModule } from '../database/database.module';
import { AdminDatabaseService } from '../admin/admin-database.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        secret: configService.get('auth', { infer: true }).jwtSecret,
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthGuard, AdminDatabaseService, AdminAuthService],
  exports: [AdminAuthGuard, JwtModule],
})
export class AuthModule {}
