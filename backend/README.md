# Backend

NestJS monolith: one application (`src/main.ts`) serving the HTTP API (public ingestion, admin) and
running the BullMQ queue processors in the same process, backed by PostgreSQL and Redis.
Architecture diagrams: `../documentation/*.puml`.

## Local setup

Run from `backend/` unless noted (commands work in bash and PowerShell).

1. Start PostgreSQL (`127.0.0.1:5440`) and Redis (`127.0.0.1:6390`) from the repository root:

   ```bash
   docker compose up -d
   ```

   The PostgreSQL data lives in the `pgdata` volume and the schema is owned by the TypeORM
   migrations. The earlier `cep-postgres` volume (raw SQL schema) is not reused or migrated: the
   migrations cannot run on top of it. If you need its local data, back it up first
   (`docker run --rm -v customer-engagement-platform_cep-postgres:/data -v "$PWD":/backup alpine tar czf /backup/cep-postgres.tgz -C /data .`),
   then remove it with `docker volume rm customer-engagement-platform_cep-postgres`.

2. Install dependencies and create the schema:

   ```bash
   npm install
   cp .env.example .env
   npm run migration:run
   ```

3. Create an account and put its id into `INGESTION_ACCOUNT_ID` in `.env`:

   ```bash
   docker compose exec postgres psql -U cep -d cep -tAc "INSERT INTO accounts (name) VALUES ('local') RETURNING id"
   ```

4. Set `INGESTION_API_KEY` and `JWT_SECRET`, and set `ADMIN_PASSWORD_HASH` to a bcrypt hash
   (keep it in single quotes in `.env`, it contains `$`):

   ```bash
   node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" "your-password"
   ```

5. Run the application:

   ```bash
   npm run start:dev
   ```

Health: `GET http://localhost:3000/health`.

## HTTP API

**Ingestion** (`x-api-key` header): `POST /api/v1/identify` and `POST /api/v1/track` return
`202 Accepted` with `{ accepted: true, eventId }` after the profile and event are stored and the
`process-event` job is queued. Sequence: validate → claim the account-scoped `messageId` in Redis for
24 h → upsert profile, insert event and outbox row in one transaction → enqueue `process-event`
(`{ eventId }`, the queue contract in `src/queues/jobs.ts`). A duplicate `messageId` returns
`409 Conflict`; a failure releases the claim so the caller can retry. The outbox publisher re-adds jobs
that did not reach the queue.

```json
{ "userId": "user-123", "email": "person@example.com", "traits": { "plan": "pro" }, "messageId": "msg-123" }
```

```json
{ "userId": "user-123", "eventName": "item_viewed", "properties": { "itemId": "item-456" }, "messageId": "msg-124" }
```

**Admin** (`Authorization: Bearer <jwt>`): `POST /admin/auth/login` with `{ email, password }` returns
`{ accessToken }` (8 h). `/admin/templates`, `/admin/audiences`, `/admin/workflows`, `/admin/activity` are
placeholders (`501`) until their modules land.

## Queue processing

The `events` worker starts runs and resumes waiting ones; the `workflow-steps` worker executes a run one
node per job and records each executed node in `run_steps`. `EVENTS_QUEUE_CONCURRENCY` and
`STEPS_QUEUE_CONCURRENCY` (default 10 each) set the worker concurrency. A step job that exhausts its
retries on a transient error stays in the BullMQ failed set and leaves the run where it was, so
retrying the job resumes the run; only definition errors (missing node, no executor) fail the run.

## Scripts

- `npm run start` / `npm run start:dev` — run the application (HTTP API + queue processors)
- `npm run migration:run` / `migration:revert` / `migration:generate -- src/database/migrations/<Name>`
- `npm run lint`, `npm run format` / `format:check`, `npm run typecheck`, `npm test`
- `npm run start:prod` / `migration:run:prod` — run from the compiled `dist/` (Docker image)

The Docker image (`Dockerfile`, build context `backend/`) runs `node dist/main.js`; run
`npm run migration:run:prod` from it before rolling out a new version.
