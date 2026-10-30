import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthService } from '../auth/admin-auth.service';
import { AdminPrincipal } from '../auth/admin.types';
import { DevBootstrapInput, DevBootstrapResult, SignedIn } from '../types/dev-bootstrap.types';
import { DevFixturesService } from './dev-fixtures.service';
import { SAMPLE_WORKFLOW_NAME, sampleWorkflowDefinition } from './dev-samples';

const API_KEY_NAME = 'dev-bootstrap';

/**
 * One call from an empty database to a working setup: an admin (logged in, or registered when
 * missing), a fresh ingestion API key, and the sample template and active workflow (created once).
 */
@Injectable()
export class DevBootstrapService {
  private readonly logger = new Logger(DevBootstrapService.name);

  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly jwtService: JwtService,
    private readonly devFixturesService: DevFixturesService,
  ) {}

  async bootstrap(input: DevBootstrapInput): Promise<DevBootstrapResult> {
    const { accessToken, accountId } = await this.signIn(input);
    const apiKey = await this.adminAuthService.createApiKey(accountId, API_KEY_NAME);
    const templateId = await this.devFixturesService.ensureTemplate(accountId);
    const workflowId = await this.devFixturesService.ensureWorkflow(
      accountId,
      SAMPLE_WORKFLOW_NAME,
      sampleWorkflowDefinition(templateId),
    );
    this.logger.log({ message: 'Dev bootstrap done', accountId, templateId, workflowId });
    return { accountId, accessToken, apiKey: apiKey.key, templateId, workflowId };
  }

  /** Login first, register when that fails; an existing email with another password stays a 401. */
  private async signIn(input: DevBootstrapInput): Promise<SignedIn> {
    try {
      const { accessToken } = await this.adminAuthService.login(input);
      return {
        accessToken,
        accountId: this.jwtService.decode<AdminPrincipal>(accessToken).accountId,
      };
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
      return this.register(input, error);
    }
  }

  private async register(input: DevBootstrapInput, loginError: Error): Promise<SignedIn> {
    try {
      const { accessToken, account } = await this.adminAuthService.register(input);
      return { accessToken, accountId: account.id };
    } catch (error) {
      if (error instanceof ConflictException) throw loginError;
      throw error;
    }
  }
}
