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
- `npm run lint`, `npm run format`, `npm test`
