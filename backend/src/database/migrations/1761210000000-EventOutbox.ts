import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventOutbox1761210000000 implements MigrationInterface {
  name = 'EventOutbox1761210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "event_outbox" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_id" uuid NOT NULL CONSTRAINT "fk_event_outbox_event_id" REFERENCES "events"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_event_outbox_event" UNIQUE ("event_id")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "event_outbox"`);
  }
}
