# Customer Engagement Platform

Backend for automating email campaigns: ingest user events, run marketer-defined workflows, send emails.
Monolith: one NestJS application (`src/main.ts`) serving the HTTP API and running the BullMQ queue
consumers in the same process, backed by PostgreSQL and Redis. Architecture diagrams: `documentation/*.puml`.

## Local setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run migration:run
npm run start
```

docker-compose publishes PostgreSQL on host port 5440 and Redis on 6390 (not the defaults, so it does
not clash with other local projects).

## Scripts

- `npm run start` / `npm run start:dev` — run the application (HTTP API + queue consumers)
- `npm run migration:run` / `migration:revert` / `migration:generate -- src/database/migrations/<Name>`
- `npm run lint`, `npm run format` / `format:check`, `npm run typecheck`, `npm test`
- `npm run start:prod` / `migration:run:prod` — run from the compiled `dist/` (Docker image)
- `npm run enqueue:event -- <eventId>` — add a `process-event` job for an existing events row (local testing)

## CI/CD

- `.github/workflows/ci.yml` (PRs and `main`): format check, lint, typecheck, build, tests.
- `.github/workflows/cd.yml` (`main` and `v*` tags): builds the application image from `Dockerfile`
  and pushes it to `ghcr.io/<owner>/<repo>` (tags: commit sha, branch, semver).
  Run `npm run migration:run:prod` from the image before rolling out a new version.
