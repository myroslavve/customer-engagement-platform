import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService
  ) {}

  @Post('login')
  login(@Body() input: LoginDto): { accessToken: string } {
    if (
      input.email !== this.config.getOrThrow<string>('ADMIN_EMAIL') ||
      input.password !== this.config.getOrThrow<string>('ADMIN_PASSWORD')
    ) {
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
