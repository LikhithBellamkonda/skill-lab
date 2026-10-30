# Security

- Secrets are read from environment variables. `.env` is local-only and must not
  be committed.
- Passwords are hashed with bcrypt; the API never returns password hashes.
- Protected requests verify the JWT and load the user's active account from
  MongoDB.
- Zod validates request bodies, query parameters, and MongoDB ObjectIds.
- MongoDB duplicate-key, cast, and validation errors are mapped to safe HTTP
  responses; unexpected server errors are logged without exposing stack traces
  to clients.
- Helmet, a configured CORS allow-list, JSON body limits, and rate limits are
  enabled.
- Private item verification hints are only returned to the owner or an admin.
  Claim evidence is stored but never returned by the API.
- Uploads restrict MIME types, verify file signatures, generate random names,
  enforce file-size limits, and serve with `nosniff`.

## Deployment notes

Use a strong production `JWT_SECRET`, a least-privilege MongoDB user, and the
correct frontend origin in `CLIENT_ORIGIN`. Store hosting credentials in provider
secret settings. The current image storage uses local disk and is ephemeral on
serverless hosts; configure durable object storage before production use.
