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

2. Install dependencies and copy the environment template:

   ```bash
   npm install
   cp .env.example .env
   ```

3. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, and optionally `ADMIN_ACCOUNT_NAME` in `.env`.
   The Admin API migration idempotently creates the first account and admin user. Generate a bcrypt
   hash with:

   ```bash
   node -e "require('bcryptjs').hash(process.argv[1], 12).then(console.log)" "your-password"
   ```

4. Run the migration and retrieve the seeded account id for `INGESTION_ACCOUNT_ID`:

   ```bash
   npm run migration:run
   docker compose exec postgres psql -U cep -d cep -tAc "SELECT account_id FROM admin_users ORDER BY created_at DESC LIMIT 1"
   ```

5. Set `INGESTION_API_KEY`, `INGESTION_ACCOUNT_ID`, and `JWT_SECRET`, then run the application:

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

**Admin** (`Authorization: Bearer <token>`): `POST /admin/auth/login` with `{ email, password }`
returns `{ accessToken }` (8 h). Audience previews scan profiles in bounded batches; pushing rule
evaluation into SQL/JSONB is a future scalability improvement.

## Queue processing

The `events` worker starts runs and resumes waiting ones; the `workflow-steps` worker executes a run one
node per job and records each executed node in `run_steps`. `EVENTS_QUEUE_CONCURRENCY` and
`STEPS_QUEUE_CONCURRENCY` (default 10 each) set the worker concurrency. A step job that exhausts its
retries on a transient error stays in the BullMQ failed set and leaves the run where it was, so
retrying the job resumes the run; only definition errors (missing node, no executor) fail the run.

## Email

A `send_email` node records one `messages` row per run and node and queues an `email-send` job; the
run moves on at once. The `email-send` worker renders the template's `{{path}}` placeholders
(`{{profile.traits.name}}`, `{{event.properties.product_title}}`; HTML-escaped in the body) and sends
it, rate-limited to 2 sends/second (Resend's limit); `EMAIL_QUEUE_CONCURRENCY` (default 2) sets the
worker concurrency.

Emails go through Resend; `RESEND_API_KEY` is required (a free account works locally). Until a domain
is verified, keep `EMAIL_FROM=onboarding@resend.dev` and send only to the Resend account owner's
address. The Resend SDK prints its own `console.error` for every API error unless `NODE_ENV=production`.

Message statuses: `queued` → `sending` → `sent` | `failed`, or `skipped`. Reasons in `messages.error`:
`no_email` / `unsubscribed` (skipped: the profile has no address or `profiles.unsubscribed_at` is set),
`template_not_found` (the template was deleted after the message was queued), `send_interrupted` (an
earlier attempt reached the provider but its outcome is unknown; the email is not resent, so it is
delivered at most once), or the provider's error after the last retry. A `send_email` node whose
template is not one of the account's templates fails its run.

## Scripts

- `npm run start` / `npm run start:dev` — run the application (HTTP API + queue processors)
- `npm run migration:run` / `migration:revert` / `migration:generate -- src/database/migrations/<Name>`
- `npm run lint`, `npm run format` / `format:check`, `npm run typecheck`, `npm test`
- `npm run start:prod` / `migration:run:prod` — run from the compiled `dist/` (Docker image)

The Docker image (`Dockerfile`, build context `backend/`) runs `node dist/main.js`; run
`npm run migration:run:prod` from it before rolling out a new version.
