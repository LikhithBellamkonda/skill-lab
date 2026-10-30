# Smart Lost & Found

A campus lost-and-found application built with React, Express, and MongoDB. Users
can report lost or found items, search listings, view candidate matches, submit
claims, and receive notifications. Administrators can review claims and moderate
reports.

## Stack

- Frontend: React, Vite, React Router
- API: Node.js, Express, Mongoose
- Database: MongoDB (local MongoDB or MongoDB Atlas)
- Authentication: JWT and bcrypt
- Validation: Zod

## Run locally

Requirements: Node.js 20.19+, npm 10+, and MongoDB 7+ (or Docker Desktop).

```powershell
Copy-Item .env.example .env
docker compose up -d mongo
npm ci
npm run db:seed
npm run dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:4000`; its
health endpoint is `http://localhost:4000/api/v1/health?db=1`.

The development seed creates demo accounts:

| Role  | Email               | Password      |
| ----- | ------------------- | ------------- |
| Admin | `admin@campus.test` | `Password123` |
| User  | `ada@campus.test`   | `Password123` |

These credentials are for local testing only. Do not run `npm run db:seed` against
a production database. The seed is idempotent and does not delete existing data.
Create a production administrator with `npm run admin:create`.

If MongoDB is installed locally instead of Docker, keep the sample
`DATABASE_URL=mongodb://localhost:27017/smart_lost_found` in `.env`.

## Deploy

The app is not local-only. It can be deployed as separate Vercel projects:

1. Deploy the frontend with the Vercel project root set to `client`.
2. Deploy the API with the project root set to `server`, or use the included
   Render Blueprint (`render.yaml`).
3. Use MongoDB Atlas for the production database.

See [deployment guide](docs/deployment.md) for environment variables and setup.
Uploaded files currently use local disk (`/tmp` on serverless hosts), which is
ephemeral. Use a persistent disk or add object storage before relying on uploaded
images in production.

## Useful commands

```powershell
npm run dev          # frontend and API
npm run build        # production frontend build
npm test             # backend tests
npm run lint         # ESLint
npm run db:status    # connect and check the configured MongoDB
npm run db:seed      # add local demo data without deleting records
npm run admin:create -- --email=you@example.com --name="Your Name"
```

## Project layout

- `client/` — React application and Vite/Vercel configuration
- `server/src/` — Express API, MongoDB models, routes, and services
- `server/api/` — Vercel serverless API entry point
- `docs/` — architecture, API, database, testing, security, and deployment notes

See [API reference](docs/api-reference.md) and [database design](docs/database-design.md).
