import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../infra/database.service';
import { AdminPrincipal } from './admin.types';

type AdminLoginInput = { email: string; password: string };

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async login(input: AdminLoginInput): Promise<{ accessToken: string }> {
    const result = await this.database.query<{
      id: string;
      account_id: string;
      email: string;
      password_hash: string;
      role: string;
    }>(
      `SELECT id, account_id, email, password_hash, role
       FROM admin_users
       WHERE LOWER(email) = LOWER($1)`,
      [input.email]
    );
    const user = result.rows[0];
    const passwordMatches = await compare(
      input.password,
      user?.password_hash ??
        '$2b$12$ijldV01X2TgdaCJG210K0ucLkKYEiYe5b8jG/ihCG44dw52b8TvFy'
    );
    if (!user || !passwordMatches || user.role !== 'admin') {
      throw new UnauthorizedException('Invalid credentials');
    }
    const principal: AdminPrincipal = {
      userId: user.id,
      accountId: user.account_id,
      email: user.email,
      role: user.role
    };
    return {
      accessToken: this.jwt.sign(principal, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '8h'
      })
    };
  }

  async createApiKey(accountId: string, name: string) {
    const rawKey = `cep_${randomBytes(24).toString('base64url')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);
    const result = await this.database.query<{
      id: string;
      name: string;
      key_prefix: string;
      created_at: string;
    }>(
      `INSERT INTO api_keys (account_id, name, key_prefix, key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, key_prefix, created_at`,
      [accountId, name, keyPrefix, keyHash]
    );
    return { ...result.rows[0], key: rawKey };
  }

  async listApiKeys(accountId: string) {
    const result = await this.database.query(
      `SELECT id, name, key_prefix, revoked_at, created_at
       FROM api_keys
       WHERE account_id = $1
       ORDER BY created_at DESC`,
      [accountId]
    );
    return result.rows;
  }

  async revokeApiKey(accountId: string, id: string): Promise<void> {
    const result = await this.database.query(
      `UPDATE api_keys
       SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE id = $1 AND account_id = $2
       RETURNING id`,
      [id, accountId]
    );
    if (!result.rows[0]) throw new NotFoundException('API key not found');
  }
}
