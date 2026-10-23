import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { compare } from 'bcryptjs';
import { AppConfig } from '../config/configuration';
import { LoginDto } from './login.dto';

/** Compared against when the email is unknown, so both paths spend the same bcrypt time. */
const DUMMY_PASSWORD_HASH = '$2b$12$ijldV01X2TgdaCJG210K0ucLkKYEiYe5b8jG/ihCG44dw52b8TvFy';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly jwtService: JwtService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() input: LoginDto): Promise<{ accessToken: string }> {
    const { adminEmail, adminPasswordHash } = this.configService.get('auth', { infer: true });
    const emailMatches = input.email === adminEmail;
    const passwordMatches = await compare(
      input.password,
      emailMatches ? adminPasswordHash : DUMMY_PASSWORD_HASH,
    );
    if (!emailMatches || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { accessToken: this.jwtService.sign({ sub: input.email, role: 'admin' }) };
  }
}
