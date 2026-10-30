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
- `POST /admin/login` — `{ email, password }` returns `{ accessToken }` (8 h).
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

## Dev tools

Test the engine end to end without the admin UI or a client product. `DEV_TOOLS_ENABLED=true`
(local only: every `/dev` route answers 404 otherwise, and the config refuses the flag when
`NODE_ENV=production`). Every route but bootstrap takes the admin bearer token. Runs are started
through the real ingestion service (identify + track, idempotency, outbox, `events` queue), so the
worker path is the one the public API uses.

| Route | What it does |
|---|---|
| `POST /dev/bootstrap` (public) | `{ email?, password?, accountName? }` (defaults `dev@example.com` / `password123` / `Dev`): logs in or registers the admin, creates a fresh API key, the sample template and the active sample workflow (`item_viewed` → wait 24 h for `purchase` → reminder). Returns `{ accountId, accessToken, apiKey, templateId, workflowId }`. |
| `GET /dev/scenarios` | Built-in scenarios: one workflow per node type and outcome, plus `everything`. Each has a `hint` on how to drive it. |
| `POST /dev/scenarios/:name/run` | Creates the scenario's workflow once (trigger `dev.<name>`), then identifies a profile and tracks the trigger. Body (all optional): `{ userId, email, traits, properties, unsubscribed }`; a fresh `dev-<id>` user with `<userId>@example.com` by default, `email: null` for none. Returns `{ workflowId, userId, eventName, eventId, runId }` (`runId` null if no run started within 5 s). |
| `POST /dev/workflows/run` | Same, for any definition: `{ definition, ...trigger body }`. Validated like `POST /admin/workflows`; a new workflow per call, its trigger event name replaced by a unique `dev.adhoc.<id>` (the trigger filter is kept and sees `properties`). |
| `POST /dev/runs/:id/events` | `{ eventName, properties? }`: tracks an event as the run's profile, e.g. the `purchase` a wait node waits for. |
| `POST /dev/runs/:id/fast-forward` | Runs the run's pending delay or wait timeout now. Returns `{ promoted }`. |
| `GET /dev/runs?userId=&limit=`, `GET /dev/runs/:id` | Runs with their `steps` (node, cause, status, output) and `messages` (status, error, attempts). |
| `GET /dev/queues` | Job counts per queue. |

Scenarios: `send-email`, `branch` (`traits.plan == "pro"` sends), `delay` (1 h), `wait-for-event`
(`purchase` with `amount > 0`, 1 day timeout), `missing-template` (the run fails), `everything`.

```bash
B=http://localhost:3000
TOKEN=$(curl -s -X POST $B/dev/bootstrap -H 'content-type: application/json' -d '{}' | jq -r .accessToken)
H=(-H "authorization: Bearer $TOKEN" -H 'content-type: application/json')

RUN=$(curl -s -X POST $B/dev/scenarios/wait-for-event/run "${H[@]}" -d '{}' | jq -r .runId)
curl -s -X POST $B/dev/runs/$RUN/events "${H[@]}" -d '{"eventName":"purchase","properties":{"amount":10}}'
# or the timeout path: curl -s -X POST $B/dev/runs/$RUN/fast-forward "${H[@]}"
curl -s $B/dev/runs/$RUN "${H[@]}" | jq '{status, steps: [.steps[] | .nodeId + ":" + .cause], messages: [.messages[].status]}'
```

The public ingestion API works too (`x-api-key` from bootstrap): tracking `item_viewed` starts the
sample workflow.

## Queue processing

The `events` worker starts runs and resumes waiting ones; the `workflow-steps` worker executes a run one
node per job and records each executed node in `run_steps`. `EVENTS_QUEUE_CONCURRENCY` and
`STEPS_QUEUE_CONCURRENCY` (default 10 each) set the worker concurrency. Every job gets
`QUEUE_JOB_ATTEMPTS` attempts (default 5) with exponential backoff from `QUEUE_BACKOFF_DELAY_MS`
(default 1000). A step job that exhausts its
retries on a transient error stays in the BullMQ failed set and leaves the run where it was, so
retrying the job resumes the run; only definition errors (missing node, no executor) fail the run.

Status columns (`workflows`, `workflow_runs`, `run_steps`, `messages`) are `varchar`, not Postgres
enums: the allowed values are the TypeScript enums in `src/enums/`, so a new status needs no migration.

## Email

A `send_email` node records one `messages` row per run and node and queues an `email-send` job; the
run moves on at once. The `email-send` worker renders the template's `{{path}}` placeholders
(`{{profile.traits.name}}`, `{{event.properties.product_title}}`; HTML-escaped in the body) and sends
it, rate-limited to 2 sends/second (Resend's limit); `EMAIL_QUEUE_CONCURRENCY` (default 2) sets the
worker concurrency.

Emails go through Resend; `RESEND_API_KEY` and `EMAIL_FROM` are required. Locally a free account
works with `EMAIL_FROM=onboarding@resend.dev`, which only delivers to the Resend account owner's
address; deployments must set `EMAIL_FROM` to a sender on a verified domain. Without a Resend account, point
the SDK at a local stub of its API with `RESEND_BASE_URL=http://127.0.0.1:<port>` (any server that
answers `POST /emails` with `{ "id": "..." }`, or a Resend error body `{ name, message, statusCode }`). The Resend SDK prints its own `console.error` for every API error unless `NODE_ENV=production`.

Message statuses: `queued` → `sending` → `sent` | `failed`, or `skipped`. Reasons in `messages.error`:
`no_email` / `unsubscribed` (skipped: the profile has no address or `profiles.unsubscribed_at` is set),
`template_not_found` (the template was deleted after the message was queued), `send_interrupted` (an
earlier attempt reached the provider but its outcome is unknown; the email is not resent, so it is
delivered at most once), or the provider's error after the last retry. A `send_email` node whose
template is not one of the account's templates fails its run.

## Scripts

- `npm run start` / `npm run start:dev` — run the application (HTTP API + queue processors)
- `npm run migration:run` / `migration:revert` / `migration:generate -- src/database/migrations/<Name>`
- `npm run lint`, `npm run format` / `format:check`, `npm run typecheck`, `npm test` (unit tests,
  no infrastructure)
- `npm run test:integration` — integration tests (`test/`) on the docker-compose PostgreSQL and
  Redis: the real application with only the email provider faked. They use the `cep_test` database
  (created and migrated automatically) and Redis db 1, configured in `.env.test`; shell variables
  override it (CI sets hosts and ports). The tests shorten `QUEUE_BACKOFF_DELAY_MS` to 20 ms.
- `npm run start:prod` / `migration:run:prod` — run from the compiled `dist/` (Docker image)

The Docker image (`Dockerfile`, build context `backend/`) runs `node dist/main.js`; run
`npm run migration:run:prod` from it before rolling out a new version.
