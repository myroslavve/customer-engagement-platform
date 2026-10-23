import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { AccountService } from './account.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminRequest, requireAccountId } from './admin-request';

class RenameAccountDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}

@Controller('admin/account')
@UseGuards(AdminAuthGuard)
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Get()
  get(@Req() request: AdminRequest) {
    return this.accountService.get(requireAccountId(request));
  }

  @Patch()
  rename(@Req() request: AdminRequest, @Body() input: RenameAccountDto) {
    return this.accountService.rename(requireAccountId(request), input.name);
  }
}
