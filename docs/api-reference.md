# API reference

Base path: `/api/v1`. Successful responses use `{ "data": ... }`; errors use
`{ "error": { "code": "...", "message": "...", "details": ... } }`. Protected
routes require `Authorization: Bearer <JWT>`.

## Health

- `GET /health` — liveness
- `GET /health?db=1` — readiness, including MongoDB

## Authentication

- `POST /auth/register` — create a user
- `POST /auth/login` — authenticate
- `GET /auth/me` — current profile and counts
- `POST /auth/change-password` — change current password

## Items

- `GET /items` — public search, filters, and pagination
- `GET /items/:itemId` — public-safe report details; owners/admins also see private verification hints
- `POST /items` — create a report
- `PATCH /items/:itemId` — update an owned report
- `PATCH /items/:itemId/status` — change lifecycle status
- `DELETE /items/:itemId` — soft-delete an owned report
- `POST /items/:itemId/images` — upload JPEG, PNG, or WebP
- `DELETE /items/:itemId/images/:imageId` — remove an image
- `GET /users/me/items` — current user's reports
- `GET /categories` — category list

Item IDs and category IDs are MongoDB ObjectIds encoded as 24-character hex
strings. Item status values are `open`, `matched`, `claimed`, `returned`,
`closed`, and `rejected`.

## Matches

- `GET /matches` — matches for the current user's reports
- `GET /matches/:matchId` — match details
- `POST /matches/:matchId/dismiss` — dismiss a suggestion
- `POST /matches/recalculate` — recalculate matches for the current user's reports; optional body `{ "itemId": "..." }`
- `GET /items/:itemId/matches` — matches for an owned report

## Claims

- `POST /items/:itemId/claims` — submit a claim
- `GET /claims/me` — current user's claims
- `POST /claims/:claimId/withdraw` — withdraw a pending claim
- `GET /admin/claims` and `GET /admin/claims/:claimId` — administrator review queue
- `PATCH /admin/claims/:claimId` — approve or reject a claim

## Notifications

- `GET /notifications` — current user's notifications
- `GET /notifications/unread-count` — unread count
- `PATCH /notifications/:notificationId/read` — mark one read
- `PATCH /notifications/read-all` — mark all read

## Administrator

- `GET /admin/stats`
- `GET /admin/users`
- `PATCH /admin/users/:userId/status`
- `GET /admin/items`
- `GET /admin/items/:itemId`
- `PATCH /admin/items/:itemId/moderation`
- `GET /admin/audit-logs`

See the client API wrappers in `client/src/api/endpoints.js` for query and payload
shapes used by the UI.
