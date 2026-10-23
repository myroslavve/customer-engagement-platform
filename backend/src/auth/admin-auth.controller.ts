import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminPrincipal } from './admin.types';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class CreateApiKeyDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}

type AdminRequest = Request & { user?: AdminPrincipal };

@Controller('admin')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  login(@Body() input: LoginDto) {
    return this.adminAuthService.login(input);
  }

  @UseGuards(AdminAuthGuard)
  @Get('auth/me')
  me(@Req() request: AdminRequest) {
    if (!request.user) throw new UnauthorizedException('Missing admin principal');
    return request.user;
  }

  @UseGuards(AdminAuthGuard)
  @Post('auth/api-keys')
  createApiKey(@Req() request: AdminRequest, @Body() input: CreateApiKeyDto) {
    return this.adminAuthService.createApiKey(this.accountId(request), input.name);
  }

  @UseGuards(AdminAuthGuard)
  @Get('auth/api-keys')
  listApiKeys(@Req() request: AdminRequest) {
    return this.adminAuthService.listApiKeys(this.accountId(request));
  }

  @UseGuards(AdminAuthGuard)
  @Delete('auth/api-keys/:id')
  revokeApiKey(@Req() request: AdminRequest, @Param('id') id: string) {
    return this.adminAuthService.revokeApiKey(this.accountId(request), id);
  }

  private accountId(request: AdminRequest): string {
    if (!request.user?.accountId) throw new UnauthorizedException('Missing account context');
    return request.user.accountId;
  }
}
