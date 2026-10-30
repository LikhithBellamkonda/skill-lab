# Deployment

## Recommended layout

Deploy the Vite frontend and Express API separately, with MongoDB Atlas as the
shared database:

- Vercel project 1: root directory `client`
- Vercel project 2: root directory `server`; the included `server/vercel.json`
  routes requests through `server/api/index.js`
- MongoDB Atlas: production database and credentials

Alternatively, deploy the API to Render using the repository's `render.yaml` and
deploy only the frontend to Vercel.

## MongoDB Atlas

1. Create a MongoDB cluster and a database user with only the permissions the app
   needs.
2. Configure Atlas Network Access for the selected API host. Avoid opening access
   to every address unless the deployment requires it and you accept that risk.
3. Copy the Atlas connection URI into the API's `DATABASE_URL`. Keep credentials
   in the hosting provider's secret environment settings, not in Git.

## Vercel environment

Set these variables for the API project:

| Variable              | Value                                                    |
| --------------------- | -------------------------------------------------------- |
| `NODE_ENV`            | `production`                                             |
| `DATABASE_URL`        | MongoDB Atlas connection URI                             |
| `JWT_SECRET`          | Random secret of at least 32 characters                  |
| `CLIENT_ORIGIN`       | Exact deployed frontend origin, without a trailing slash |
| `MONGO_MAX_POOL_SIZE` | `5` (a small pool is recommended for serverless)         |
| `UPLOAD_DIR`          | `/tmp/uploads`                                           |

Set these variables for the frontend project:

| Variable          | Value                                     |
| ----------------- | ----------------------------------------- |
| `VITE_API_URL`    | `https://<api-project>.vercel.app/api/v1` |
| `VITE_API_ORIGIN` | `https://<api-project>.vercel.app`        |

Redeploy the frontend after changing its `VITE_*` variables; Vite embeds them at
build time.

For the Render API option, set `DATABASE_URL` and `CLIENT_ORIGIN` in the Render
dashboard. The Blueprint generates `JWT_SECRET` and sets `UPLOAD_DIR=/tmp/uploads`.
Free Render services may sleep while idle.

## Administrator and health check

Create the first administrator from a trusted terminal after configuring the API
environment:

```powershell
npm run admin:create -- --email=you@example.com --name="Your Name"
```

Verify the API and MongoDB connection:

```text
https://<api-origin>/api/v1/health?db=1
```

The endpoint should return HTTP 200 and `checks.database.status: "ok"`.

## Image storage limitation

The current upload middleware writes files to the API's local filesystem. Vercel
functions and Render's ephemeral filesystem do not guarantee that files survive
restarts or redeployments; on Vercel, `/tmp` is temporary and instance-local.
Use durable object storage (for example, an S3-compatible service) or a host with
a persistent disk before relying on production image uploads. The storage adapter
is not included in this repository.

## Local development

```powershell
Copy-Item .env.example .env
docker compose up -d mongo
npm ci
npm run db:seed
npm run dev
```

Run `npm run db:status` and check `http://localhost:4000/api/v1/health?db=1` if
the application cannot reach MongoDB.
