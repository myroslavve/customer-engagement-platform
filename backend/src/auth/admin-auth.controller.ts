import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import { compare } from 'bcryptjs';
import { IsEmail, IsString, MinLength } from 'class-validator';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller('admin/auth')
export class AdminAuthController {
  private readonly dummyPasswordHash =
    '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7Qf7R7uYh5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y';

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() input: LoginDto): Promise<{ accessToken: string }> {
    const configuredEmail = this.config.getOrThrow<string>('ADMIN_EMAIL');
    const configuredHash = this.config.getOrThrow<string>('ADMIN_PASSWORD_HASH');
    const passwordMatches = await compare(
      input.password,
      input.email === configuredEmail ? configuredHash : this.dummyPasswordHash
    );
    if (input.email !== configuredEmail || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return {
      accessToken: this.jwt.sign(
        { sub: input.email, role: 'admin' },
        { secret: this.config.getOrThrow<string>('JWT_SECRET'), expiresIn: '8h' }
      )
    };
  }
}
