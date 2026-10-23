import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { IdentifyDto, TrackDto } from './ingestion.dto';
import { IngestionService } from './ingestion.service';

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('identify')
  @HttpCode(HttpStatus.ACCEPTED)
  identify(@Body() input: IdentifyDto) {
    return this.ingestion.identify(input);
  }

  @Post('track')
  @HttpCode(HttpStatus.ACCEPTED)
  track(@Body() input: TrackDto) {
    return this.ingestion.track(input);
  }
}
