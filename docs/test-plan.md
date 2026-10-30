# Test plan

## Automated checks

Run from the repository root:

```powershell
npm test
npm run lint
npm run build
npm audit --omit=dev
```

The backend tests cover MongoDB ObjectId validation, frontend/API status
compatibility, item response privacy, WebP signature validation, liveness versus
database readiness, and MongoDB duplicate-key error mapping. These contract tests
do not require a running database.

## Manual integration check

With MongoDB running and `.env` configured:

1. Run `npm run db:status` and verify `/api/v1/health?db=1` returns HTTP 200.
2. Seed local demo records with `npm run db:seed`.
3. Log in using the local-only demo credentials in the README.
4. Create and search a report; verify map coordinates and category display.
5. Submit and review a claim; verify that evidence is never returned by the API.
6. Upload JPEG, PNG, and WebP files; verify that unsupported or spoofed files are rejected.
7. Check user-facing notifications and administrator audit entries.

Never point automated tests or the demo seed at a production database.
