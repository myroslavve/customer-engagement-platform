import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcryptjs';
import { AdminDatabaseService } from '../admin/admin-database.service';
import { isUniqueViolation } from '../database/is-unique-violation';

type CreateAdminUserInput = { email: string; password: string };

@Injectable()
export class AdminUsersService {
  constructor(private readonly database: AdminDatabaseService) {}

  async list(accountId: string) {
    const result = await this.database.query(
      `SELECT id, email, role, last_login_at, created_at, updated_at
       FROM admin_users WHERE account_id = $1 ORDER BY created_at ASC`,
      [accountId],
    );
    return result.rows;
  }

  async create(accountId: string, input: CreateAdminUserInput) {
    const passwordHash = await hash(input.password, 12);
    try {
      const result = await this.database.query(
        `INSERT INTO admin_users (account_id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, email, role, last_login_at, created_at, updated_at`,
        [accountId, input.email.trim(), passwordHash],
      );
      return result.rows[0];
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('An admin with this email already exists');
      }
      throw error;
    }
  }

  /** Admin-initiated reset. Bumps the token version, invalidating the target's sessions. */
  async resetPassword(accountId: string, id: string, password: string): Promise<void> {
    const passwordHash = await hash(password, 12);
    const result = await this.database.query(
      `UPDATE admin_users
       SET password_hash = $1, token_version = token_version + 1, updated_at = NOW()
       WHERE id = $2 AND account_id = $3
       RETURNING id`,
      [passwordHash, id, accountId],
    );
    if (!result.rows[0]) throw new NotFoundException('Admin user not found');
  }

  async remove(accountId: string, id: string, currentUserId: string): Promise<void> {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.database.transaction(async (queryRunner) => {
      // Serialize admin changes for the account so two requests cannot remove the last two admins.
      await queryRunner.query(`SELECT id FROM accounts WHERE id = $1 FOR UPDATE`, [accountId]);
      const users = (await queryRunner.query(
        `SELECT id, role FROM admin_users WHERE id = $1 AND account_id = $2`,
        [id, accountId],
      )) as Array<{ id: string; role: string }>;
      if (!users[0]) throw new NotFoundException('Admin user not found');

      const counts = (await queryRunner.query(
        `SELECT COUNT(*)::int AS count FROM admin_users
         WHERE account_id = $1 AND role = 'admin'`,
        [accountId],
      )) as Array<{ count: number }>;
      if (users[0].role === 'admin' && Number(counts[0]?.count ?? 0) <= 1) {
        throw new ConflictException('Cannot delete the last admin');
      }

      await queryRunner.query(`DELETE FROM admin_users WHERE id = $1 AND account_id = $2`, [
        id,
        accountId,
      ]);
    });
  }
}
