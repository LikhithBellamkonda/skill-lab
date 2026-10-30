# Architecture

```text
React + Vite client
       │ JSON / HTTP, JWT bearer token
       ▼
Express API (local, Vercel function, or Render service)
       │ Mongoose
       ▼
MongoDB (local or MongoDB Atlas)
```

## Client

The React application uses client-side routes and calls the versioned API under
`/api/v1`. During local development Vite proxies `/api` and `/uploads` to
`localhost:4000`. Production deployments set `VITE_API_URL` and
`VITE_API_ORIGIN` to the API host.

## API

`server/src/app.js` configures HTTP security headers, CORS, body size limits,
request logging, static uploads, routing, and the common error handler. Feature
routes are organized in `server/src/modules/`; MongoDB schemas are in
`server/src/models/`. Route inputs are validated with Zod before services run.

The API uses JWT authentication and checks the current user record on protected
requests, so deactivated accounts lose access even if a token has not expired.
Private verification hints and claim evidence are not included in public
responses.

## MongoDB

Mongoose models use ObjectId references between users, categories, items, claims,
matches, notifications, and audit records. GeoJSON Point locations use a
`2dsphere` index for radius searches. Connections are shared/reused across
serverless invocations and the connection pool size is configurable.

MongoDB standalone deployments do not support multi-document transactions. The
claim decision flow uses guarded document updates; for workloads requiring
transactional guarantees, use a MongoDB replica set such as MongoDB Atlas.

## Deployment

The frontend and API can be deployed as separate Vercel projects or the API can
run on Render. See [deployment.md](deployment.md). The current image upload
implementation uses local disk and therefore is not durable on serverless or
ephemeral hosts.
