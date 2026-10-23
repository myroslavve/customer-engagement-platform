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

**Admin** (`Authorization: Bearer <token>` unless noted):

- `POST /admin/auth/register` (public, 3/min) — `{ accountName, email, password }` creates an
  account and its first admin, then returns `{ accessToken, account }`. One admin belongs to one
  account; there is no membership or account-switching flow. Emails are globally unique because
  login identifies the account by email.
- `POST /admin/auth/login` — `{ email, password }` returns `{ accessToken }` (8 h).
- `GET /admin/auth/me` — current principal (`userId`, `accountId`, `email`, `role`).
- `POST /admin/auth/password` — `{ currentPassword, newPassword }` returns a fresh
  `{ accessToken }`. It bumps the admin's token version, so the other sessions are rejected
  immediately.
- `GET /admin/account` / `PATCH /admin/account` — read or rename (`{ name }`) the current account.
- `GET /admin/users`, `POST /admin/users` (`{ email, password }`), `PATCH /admin/users/:id`
  (`{ password }` reset), `DELETE /admin/users/:id` — admins in the current account. Self-deletion
  and deleting the last admin are rejected.
- `POST /admin/auth/api-keys`, `GET /admin/auth/api-keys`, `DELETE /admin/auth/api-keys/:id` —
  ingestion API keys.

The guard verifies the JWT and checks `admin_users.token_version` on every admin request. Deleting
an admin or changing a password therefore invalidates existing tokens immediately; the trade-off is
one indexed database read per admin request. Audience previews scan profiles in bounded batches;
pushing rule evaluation into SQL/JSONB is a future scalability improvement.

For deployments, run migrations before starting the new application version. During a rolling
upgrade, old application instances do not check token versions, so immediate token revocation is
guaranteed only after all old instances have been replaced. Do not route authenticated traffic to
an older version after enabling token-version revocation.

## Scripts

- `npm run start` / `npm run start:dev` — run the application (HTTP API + queue processors)
- `npm run migration:run` / `migration:revert` / `migration:generate -- src/database/migrations/<Name>`
- `npm run lint`, `npm run format` / `format:check`, `npm run typecheck`, `npm test`
- `npm run start:prod` / `migration:run:prod` — run from the compiled `dist/` (Docker image)

The Docker image (`Dockerfile`, build context `backend/`) runs `node dist/main.js`; run
`npm run migration:run:prod` from it before rolling out a new version.
