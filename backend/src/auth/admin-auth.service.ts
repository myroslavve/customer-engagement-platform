import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AdminDatabaseService } from '../admin/admin-database.service';
import { isUniqueViolation } from '../database/is-unique-violation';
import { AdminPrincipal } from './admin.types';

type AdminLoginInput = { email: string; password: string };
type RegisterInput = { accountName: string; email: string; password: string };

type AdminUserRow = {
  id: string;
  account_id: string;
  email: string;
  role: string;
  token_version: number;
};

type AccountRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly database: AdminDatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async login(input: AdminLoginInput): Promise<{ accessToken: string }> {
    const result = await this.database.query<AdminUserRow & { password_hash: string }>(
      `SELECT id, account_id, email, password_hash, role, token_version
       FROM admin_users WHERE LOWER(email) = LOWER($1)`,
      [input.email],
    );
    const user = result.rows[0];
    const passwordMatches = await compare(
      input.password,
      user?.password_hash ?? '$2b$12$ijldV01X2TgdaCJG210K0ucLkKYEiYe5b8jG/ihCG44dw52b8TvFy',
    );
    if (!user || !passwordMatches || user.role !== 'admin') {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.database.query(`UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`, [
      user.id,
    ]);
    return { accessToken: this.jwtService.sign(this.toPrincipal(user)) };
  }

  /** Creates an account and its first admin. One admin belongs to one account. */
  async register(input: RegisterInput): Promise<{ accessToken: string; account: AccountRow }> {
    const accountName = input.accountName.trim();
    if (!accountName) throw new BadRequestException('Account name is required');
    const passwordHash = await hash(input.password, 12);
    let created: { account: AccountRow; user: AdminUserRow };
    try {
      created = await this.database.transaction(async (queryRunner) => {
        const accounts = (await queryRunner.query(
          `INSERT INTO accounts (name) VALUES ($1)
           RETURNING id, name, created_at, updated_at`,
          [accountName],
        )) as AccountRow[];
        const users = (await queryRunner.query(
          `INSERT INTO admin_users (account_id, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING id, account_id, email, role, token_version`,
          [accounts[0].id, input.email.trim(), passwordHash],
        )) as AdminUserRow[];
        return { account: accounts[0], user: users[0] };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An admin with this email already exists');
      }
      throw error;
    }
    return {
      accessToken: this.jwtService.sign(this.toPrincipal(created.user)),
      account: created.account,
    };
  }

  async changePassword(
    principal: AdminPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ accessToken: string }> {
    const result = await this.database.query<{ password_hash: string }>(
      `SELECT password_hash FROM admin_users WHERE id = $1 AND account_id = $2`,
      [principal.userId, principal.accountId],
    );
    const user = result.rows[0];
    if (!user) throw new UnauthorizedException('Admin account not found');
    if (!(await compare(currentPassword, user.password_hash))) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await hash(newPassword, 12);
    const updated = await this.database.query<{ token_version: number }>(
      `UPDATE admin_users
       SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
       WHERE id = $2 AND account_id = $3
       RETURNING token_version`,
      [passwordHash, principal.userId, principal.accountId],
    );
    const row = updated.rows[0];
    if (!row) throw new UnauthorizedException('Admin account not found');
    return {
      accessToken: this.jwtService.sign({ ...principal, tokenVersion: row.token_version }),
    };
  }

  async createApiKey(accountId: string, name: string) {
    const rawKey = `cep_${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const result = await this.database.query(
      `INSERT INTO api_keys (account_id, name, key_prefix, key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, key_prefix, created_at`,
      [accountId, name, rawKey.slice(0, 12), keyHash],
    );
    return { ...result.rows[0], key: rawKey };
  }

  async listApiKeys(accountId: string) {
    const result = await this.database.query(
      `SELECT id, name, key_prefix, revoked_at, created_at
       FROM api_keys WHERE account_id = $1 ORDER BY created_at DESC`,
      [accountId],
    );
    return result.rows;
  }

  async revokeApiKey(accountId: string, id: string): Promise<void> {
    const result = await this.database.query(
      `UPDATE api_keys SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = $1 AND account_id = $2 RETURNING id`,
      [id, accountId],
    );
    if (!result.rows[0]) throw new NotFoundException('API key not found');
  }

  private toPrincipal(user: AdminUserRow): AdminPrincipal {
    return {
      userId: user.id,
      accountId: user.account_id,
      email: user.email,
      role: user.role,
      tokenVersion: user.token_version,
    };
  }
}
