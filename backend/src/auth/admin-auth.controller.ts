import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminRequest, requireAccountId, requirePrincipal } from './admin-request';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class RegisterDto {
  @IsString()
  @Length(1, 100)
  accountName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 72)
  password!: string;
}

class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @IsString()
  @Length(8, 72)
  newPassword!: string;
}

class CreateApiKeyDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}

@Controller('admin')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() input: LoginDto) {
    return this.adminAuthService.login(input);
  }

  @Post('auth/register')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  register(@Body() input: RegisterDto) {
    return this.adminAuthService.register(input);
  }

  @UseGuards(AdminAuthGuard)
  @Get('auth/me')
  me(@Req() request: AdminRequest) {
    return requirePrincipal(request);
  }

  @UseGuards(AdminAuthGuard)
  @Post('auth/password')
  changePassword(@Req() request: AdminRequest, @Body() input: ChangePasswordDto) {
    return this.adminAuthService.changePassword(
      requirePrincipal(request),
      input.currentPassword,
      input.newPassword,
    );
  }

  @UseGuards(AdminAuthGuard)
  @Post('auth/api-keys')
  createApiKey(@Req() request: AdminRequest, @Body() input: CreateApiKeyDto) {
    return this.adminAuthService.createApiKey(requireAccountId(request), input.name);
  }

  @UseGuards(AdminAuthGuard)
  @Get('auth/api-keys')
  listApiKeys(@Req() request: AdminRequest) {
    return this.adminAuthService.listApiKeys(requireAccountId(request));
  }

  @UseGuards(AdminAuthGuard)
  @Delete('auth/api-keys/:id')
  revokeApiKey(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminAuthService.revokeApiKey(requireAccountId(request), id);
  }
}
