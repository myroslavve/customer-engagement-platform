# Backend API

This directory contains the API and its infrastructure integration. Worker implementation is owned separately; this service only publishes `process-event` jobs to the `events` BullMQ queue.

## Local setup

1. Start dependencies from the repository root:

   ```powershell
   docker compose up -d postgres redis
   ```

2. Copy `backend\.env.example` to `backend\.env` and set local secrets.
3. Apply the schema with `psql "$env:DATABASE_URL" -f backend\db\001_initial.sql`.
4. Install and run the API:

   ```powershell
   cd backend
   npm install
   npm run start:dev
   ```

Health: `GET http://localhost:3000/health`.

Ingestion requests use `x-api-key` and are sent to `POST /api/v1/identify` or `POST /api/v1/track`. Both return an event ID after persistence and queue publication.
