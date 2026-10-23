import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IngestionResult } from '../types/ingestion-result.types';
import { ApiKeyGuard } from './api-key.guard';
import { IdentifyDto, TrackDto } from './ingestion.dto';
import { IngestionService } from './ingestion.service';

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('identify')
  @HttpCode(HttpStatus.ACCEPTED)
  identify(@Body() input: IdentifyDto): Promise<IngestionResult> {
    return this.ingestionService.identify(input);
  }

  @Post('track')
  @HttpCode(HttpStatus.ACCEPTED)
  track(@Body() input: TrackDto): Promise<IngestionResult> {
    return this.ingestionService.track(input);
  }
}
