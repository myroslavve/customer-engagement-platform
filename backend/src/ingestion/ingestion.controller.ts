import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { IdentifyDto, TrackDto } from './ingestion.dto';
import { IngestionService } from './ingestion.service';

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('identify')
  @HttpCode(HttpStatus.ACCEPTED)
  identify(@Req() request: { accountId?: string }, @Body() input: IdentifyDto) {
    return this.ingestion.identify(input, request.accountId);
  }

  @Post('track')
  @HttpCode(HttpStatus.ACCEPTED)
  track(@Req() request: { accountId?: string }, @Body() input: TrackDto) {
    return this.ingestion.track(input, request.accountId);
  }
}
