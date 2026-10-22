# Customer Engagement Platform

Backend for automating email campaigns: ingest user events, run marketer-defined workflows, send emails.
Distributed monolith: one codebase, deployed as an API Server and a Worker sharing PostgreSQL and Redis.
Architecture diagrams: `documentation/*.puml`.

## Local setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migration:run
npm run start:worker
```

If ports 5432/6379 are taken on your machine, set `POSTGRES_PORT`/`REDIS_PORT` in `.env` and update
`DATABASE_URL`/`REDIS_URL` to match.

## Scripts

- `npm run start:worker` / `npm run start:worker:dev` — run the Worker (BullMQ consumers)
- `npm run migration:run` / `migration:revert` / `migration:generate -- src/database/migrations/<Name>`
- `npm run lint`, `npm run format` / `format:check`, `npm run typecheck`, `npm test`
- `npm run start:worker:prod` / `migration:run:prod` — run from the compiled `dist/` (Docker image)
- `npm run enqueue:event -- <eventId>` — add a `process-event` job for an existing events row (local testing)

## CI/CD

- `.github/workflows/ci.yml` (PRs and `main`): format check, lint, typecheck, build, tests; then
  against real PostgreSQL and Redis services: migrations up/down/up and a Worker boot smoke test.
- `.github/workflows/cd.yml` (`main` and `v*` tags): builds the Worker image from `Dockerfile` and
  pushes it to `ghcr.io/<owner>/<repo>/worker` (tags: commit sha, branch, semver).
  Run `npm run migration:run:prod` from the image before rolling out a new version.
