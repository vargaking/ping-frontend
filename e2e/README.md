# E2E smoke tests

Playwright tests that drive the real app against a local ping-server and Postgres.
Chromium only. No voice, push or service workers.

## Run locally

1. Start Postgres and the backend (see ping-server's README). Use a throwaway database:

   ```sh
   export DB_CONNECTION_STRING=postgres://ping:ping@localhost:5432/ping_e2e
   export DEBUG=true
   export ALLOWED_ORIGINS=https://localhost:5173
   export AUTH_RATE_LIMIT=10000/minute INVITE_USE_RATE_LIMIT=10000/minute
   aerich upgrade
   uvicorn app.app:app --host 127.0.0.1 --port 8000
   ```

2. In this repo: `cp .env.example .env`, then `npx playwright install chromium` once.
3. `npm run test:e2e`

Playwright starts the dev server itself (https on `localhost:5173`, proxying to `127.0.0.1:8000`;
set `LOCAL_IP` to change the backend host). The backend is yours to start.

Each test registers fresh users with unique names, so runs don't need a clean database.

## Debugging

Failed tests keep a trace and a screenshot in `test-results/`.
Open a trace with `npx playwright show-trace <trace.zip>`.

## CI

`.github/workflows/e2e.yml` runs the suite on every pull request and on pushes to master.
Making it a required check is a branch protection setting.
