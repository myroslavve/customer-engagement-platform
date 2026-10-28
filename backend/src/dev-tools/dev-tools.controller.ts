import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminRequest, requireAccountId } from '../auth/admin-request';
import { DevBootstrapResult } from '../types/dev-bootstrap.types';
import { DevScenarioInfo } from '../types/dev-scenario.types';
import { DevTriggerResult } from '../types/dev-trigger.types';
import { IngestionResult } from '../types/ingestion-result.types';
import { QueueStats } from '../types/queue-stats.types';
import { RunDetails } from '../types/run-details.types';
import { DevBootstrapService } from './dev-bootstrap.service';
import { DevQueueService } from './dev-queue.service';
import {
  DevBootstrapDto,
  DevEventDto,
  DevRunsQueryDto,
  DevTriggerDto,
  DevWorkflowRunDto,
} from './dev-tools.dto';
import { DevToolsEnabledGuard } from './dev-tools-enabled.guard';
import { DevTriggerService } from './dev-trigger.service';
import { RunInspectorService } from './run-inspector.service';

/** Local-only shortcuts for manual testing; 404 unless DEV_TOOLS_ENABLED=true. */
@Controller('dev')
@UseGuards(DevToolsEnabledGuard)
export class DevToolsController {
  constructor(
    private readonly devBootstrapService: DevBootstrapService,
    private readonly runInspectorService: RunInspectorService,
    private readonly devQueueService: DevQueueService,
    private readonly devTriggerService: DevTriggerService,
  ) {}

  @Post('bootstrap')
  bootstrap(@Body() input: DevBootstrapDto): Promise<DevBootstrapResult> {
    return this.devBootstrapService.bootstrap(input);
  }

  @UseGuards(AdminAuthGuard)
  @Get('scenarios')
  listScenarios(): DevScenarioInfo[] {
    return this.devTriggerService.listScenarios();
  }

  @UseGuards(AdminAuthGuard)
  @Post('scenarios/:name/run')
  runScenario(
    @Req() request: AdminRequest,
    @Param('name') name: string,
    @Body() input: DevTriggerDto,
  ): Promise<DevTriggerResult> {
    return this.devTriggerService.runScenario(requireAccountId(request), name, input);
  }

  @UseGuards(AdminAuthGuard)
  @Post('workflows/run')
  runWorkflow(
    @Req() request: AdminRequest,
    @Body() { definition, ...input }: DevWorkflowRunDto,
  ): Promise<DevTriggerResult> {
    return this.devTriggerService.runDefinition(requireAccountId(request), definition, input);
  }

  @UseGuards(AdminAuthGuard)
  @Post('runs/:id/events')
  @HttpCode(HttpStatus.ACCEPTED)
  sendEvent(
    @Req() request: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() input: DevEventDto,
  ): Promise<IngestionResult> {
    return this.devTriggerService.sendEvent(requireAccountId(request), id, input);
  }

  @UseGuards(AdminAuthGuard)
  @Get('runs')
  listRuns(@Req() request: AdminRequest, @Query() query: DevRunsQueryDto): Promise<RunDetails[]> {
    return this.runInspectorService.list(requireAccountId(request), query.userId, query.limit);
  }

  @UseGuards(AdminAuthGuard)
  @Get('runs/:id')
  getRun(
    @Req() request: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RunDetails> {
    return this.runInspectorService.get(requireAccountId(request), id);
  }

  @UseGuards(AdminAuthGuard)
  @Post('runs/:id/fast-forward')
  @HttpCode(HttpStatus.OK)
  async fastForward(
    @Req() request: AdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ promoted: number }> {
    const run = await this.runInspectorService.findRunOrFail(requireAccountId(request), id);
    return { promoted: await this.devQueueService.fastForward(run.id) };
  }

  @UseGuards(AdminAuthGuard)
  @Get('queues')
  queues(): Promise<QueueStats[]> {
    return this.devQueueService.stats();
  }
}
