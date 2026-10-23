import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminDatabaseService } from '../admin/admin-database.service';

@Injectable()
export class AccountService {
  constructor(private readonly database: AdminDatabaseService) {}

  async get(accountId: string) {
    const result = await this.database.query(
      `SELECT id, name, created_at, updated_at FROM accounts WHERE id = $1`,
      [accountId],
    );
    const account = result.rows[0];
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async rename(accountId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Account name is required');
    const result = await this.database.query(
      `UPDATE accounts SET name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, created_at, updated_at`,
      [trimmed, accountId],
    );
    const account = result.rows[0];
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }
}
