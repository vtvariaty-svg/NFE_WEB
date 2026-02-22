# Runbook & Operations

## Local Setup
1. Define `DATABASE_URL` targeting your Neon Postgres instance.
2. `npm run db:migrate` from `apps/api`.
3. `npm run dev` to start both apps.

## Deployment to Render
1. Create a PostgreSQL Database on Neon.
2. Connect Render to the Github Monorepo.
3. Create a **Web Service** for `apps/api`:
    - Root Directory: `apps/api`
    - Build Command: `npm install && npm run build && npx prisma migrate deploy`
    - Start Command: `npm start`
4. Create a **Web Service** for `apps/web`:
    - Root Directory: `apps/web`
    - Build Command: `npm install && npm run build`
    - Start Command: `npm start`

## Database Management
- Migrations must be verified locally using `npm run db:migrate`.
- `npx prisma studio` connects to the local or remote db to manually fix stuck transitions.
