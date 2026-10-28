import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { WorkflowDefinition } from '../types/workflow-definition.types';

export class DevBootstrapDto {
  @IsOptional()
  @IsEmail()
  email: string = 'dev@example.com';

  @IsOptional()
  @IsString()
  @Length(8, 72)
  password: string = 'password123';

  @IsOptional()
  @IsString()
  @Length(1, 100)
  accountName: string = 'Dev';
}

export class DevTriggerDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  userId?: string;

  /** null: a profile without an address (the email is then skipped). */
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsObject()
  traits?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  unsubscribed?: boolean;
}

export class DevWorkflowRunDto extends DevTriggerDto {
  /** Validated like POST /admin/workflows; its trigger event name is replaced. */
  @IsObject()
  definition!: WorkflowDefinition;
}

export class DevEventDto {
  @IsString()
  @Length(1, 255)
  eventName!: string;

  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

export class DevRunsQueryDto {
  /** The profile's external id, as sent to identify/track. */
  @IsOptional()
  @IsString()
  @Length(1, 255)
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
