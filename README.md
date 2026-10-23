# Customer Engagement Platform

Automates email campaigns: ingest user events, run marketer-defined workflows, send emails.

## Repository layout

- `backend/` — NestJS monolith: HTTP API (ingestion, admin) and BullMQ queue processors in one
  process, backed by PostgreSQL and Redis. See `backend/README.md`.
- `frontend/` — Admin UI (added separately).
- `documentation/` — C4 architecture diagrams (`*.puml`).
- `docker-compose.yml` — local PostgreSQL (`127.0.0.1:5440`) and Redis (`127.0.0.1:6390`).

## CI/CD

- `.github/workflows/ci.yml` (PRs and `main`): backend format check, lint, typecheck, build, tests.
- `.github/workflows/cd.yml` (`main` and `v*` tags): builds the backend image from `backend/Dockerfile`
  and pushes it to `ghcr.io/<owner>/<repo>/backend` (tags: commit sha, branch, semver).
