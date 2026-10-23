import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsString, Length } from 'class-validator';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRequest, requireAccountId, requirePrincipal } from './admin-request';
import { AdminUsersService } from './admin-users.service';

class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 72)
  password!: string;
}

class ResetPasswordDto {
  @IsString()
  @Length(8, 72)
  password!: string;
}

@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  list(@Req() request: AdminRequest) {
    return this.adminUsersService.list(requireAccountId(request));
  }

  @Post()
  create(@Req() request: AdminRequest, @Body() input: CreateAdminUserDto) {
    return this.adminUsersService.create(requireAccountId(request), input);
  }

  @Patch(':id')
  resetPassword(
    @Req() request: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: ResetPasswordDto,
  ) {
    return this.adminUsersService.resetPassword(requireAccountId(request), id, input.password);
  }

  @Delete(':id')
  remove(@Req() request: AdminRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsersService.remove(
      requireAccountId(request),
      id,
      requirePrincipal(request).userId,
    );
  }
}
