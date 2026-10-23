import { Injectable, NotFoundException } from '@nestjs/common';
import { AdminDatabaseService } from './admin-database.service';

type TemplateInput = { name: string; subject: string; body: string };

@Injectable()
export class TemplateService {
  constructor(private readonly database: AdminDatabaseService) {}

  async list(accountId: string) {
    const result = await this.database.query(
      `SELECT id, name, subject, body, created_at, updated_at
       FROM templates WHERE account_id = $1 ORDER BY updated_at DESC`,
      [accountId]
    );
    return result.rows;
  }

  async create(accountId: string, input: TemplateInput) {
    const result = await this.database.query(
      `INSERT INTO templates (account_id, name, subject, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, subject, body, created_at, updated_at`,
      [accountId, input.name, input.subject, input.body]
    );
    return result.rows[0];
  }

  async update(accountId: string, id: string, input: TemplateInput) {
    const result = await this.database.query(
      `UPDATE templates
       SET name = $3, subject = $4, body = $5, updated_at = NOW()
       WHERE id = $1 AND account_id = $2
       RETURNING id, name, subject, body, created_at, updated_at`,
      [id, accountId, input.name, input.subject, input.body]
    );
    if (!result.rows[0]) throw new NotFoundException('Template not found');
    return result.rows[0];
  }

  async delete(accountId: string, id: string): Promise<void> {
    const result = await this.database.query(
      'DELETE FROM templates WHERE id = $1 AND account_id = $2 RETURNING id',
      [id, accountId]
    );
    if (!result.rows[0]) throw new NotFoundException('Template not found');
  }
}
