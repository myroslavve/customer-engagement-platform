import {
  IsEmail,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length
} from 'class-validator';

export class IngestionDto {
  @IsString()
  @Length(1, 255)
  userId!: string;

  @IsOptional()
  @IsString()
  @IsISO8601()
  timestamp?: string;

  @IsString()
  @Length(1, 255)
  messageId!: string;
}

export class IdentifyDto extends IngestionDto {
  @IsOptional()
  @IsEmail()
  @IsString()
  @Length(1, 255)
  email?: string;

  @IsOptional()
  @IsObject()
  traits?: Record<string, unknown>;
}

export class TrackDto extends IngestionDto {
  @IsString()
  @Length(1, 255)
  eventName!: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}
