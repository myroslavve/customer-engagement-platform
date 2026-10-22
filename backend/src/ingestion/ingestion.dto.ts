import {
  IsEmail,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length
} from 'class-validator';

export class IdentifyDto {
  @IsString()
  @Length(1, 255)
  userId!: string;

  @IsOptional()
  @IsEmail()
  @IsString()
  @Length(1, 255)
  email?: string;

  @IsOptional()
  @IsObject()
  traits?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsISO8601()
  timestamp?: string;

  @IsString()
  @Length(1, 255)
  messageId!: string;
}

export class TrackDto extends IdentifyDto {
  @IsString()
  @Length(1, 255)
  eventName!: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}
