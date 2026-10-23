import { Controller, Get, NotImplementedException, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminApiController {
  @Get('templates')
  templates(): never {
    throw new NotImplementedException('Templates module is not implemented yet');
  }

  @Get('audiences')
  audiences(): never {
    throw new NotImplementedException('Audiences module is not implemented yet');
  }

  @Get('workflows')
  workflows(): never {
    throw new NotImplementedException('Workflows module is owned by the workflow implementation');
  }

  @Get('activity')
  activity(): never {
    throw new NotImplementedException('Activity module is not implemented yet');
  }
}
