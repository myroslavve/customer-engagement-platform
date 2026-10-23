import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../config/configuration';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        secret: configService.get('auth', { infer: true }).jwtSecret,
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthGuard],
  exports: [AdminAuthGuard, JwtModule],
})
export class AuthModule {}
