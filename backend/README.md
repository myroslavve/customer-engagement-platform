# Backend API

This directory contains the API and its infrastructure integration. Worker implementation is owned separately; this service only publishes `process-event` jobs to the `events` BullMQ queue.

## Local setup

1. Start dependencies from the repository root:

   ```powershell
   docker compose up -d postgres redis
   ```

2. Copy `backend\.env.example` to `backend\.env` and set local secrets. Create an account in PostgreSQL and set its UUID as `INGESTION_ACCOUNT_ID`.
3. Apply the schema with `psql "$env:DATABASE_URL" -f backend\db\001_initial.sql`.
4. Install and run the API:

   ```powershell
   cd backend
   npm install
   npm run start:dev
   ```

Health: `GET http://localhost:3000/health`.

Ingestion requests use `x-api-key` and are sent to `POST /api/v1/identify` or `POST /api/v1/track`. Both return `202 Accepted` only after profile/event persistence and `process-event` queue publication.

Example identify request:

```json
{
  "userId": "user-123",
  "email": "person@example.com",
  "traits": { "plan": "pro" },
  "messageId": "msg-123"
}
```

Example track request:

```json
{
  "userId": "user-123",
  "eventName": "item_viewed",
  "properties": { "itemId": "item-456" },
  "messageId": "msg-124"
}
```

The service follows the documented sequence: validate the request, claim the account-scoped `messageId` in Redis for 24 hours, transactionally upsert the account-scoped profile and event in PostgreSQL, then publish `process-event` to the `events` BullMQ queue. The queue payload is `{ eventId: string }`, matching the worker contract. A duplicate `messageId` returns `409 Conflict`; failed persistence or queue publication releases the Redis claim so the caller can retry.
