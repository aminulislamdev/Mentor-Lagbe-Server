# Security review — MentorLagbe server

Scope: `MentorLagbe-Server` only. Reviewed and verified with `npm test` and
`npm run verify` (see the bottom of this file).

## 1. Authentication

- No passwords are stored or checked here. BetterAuth in the client app issues
  the session and a JWT; this server only verifies that JWT.
- Verification uses BetterAuth's **JWKS** (asymmetric), not a shared secret, so a
  leaked server environment cannot mint tokens. Signature, issuer, audience and
  expiry are all checked (`utils/jwt.js`).
- The `sub` claim must be a 24-character ObjectId, and the user must still exist
  in MongoDB — a deleted account is rejected even with a valid, unexpired token.
- `JWT_SECRET` may still sit in `.env` from early setup; it is **unused**. The
  signing key lives in BetterAuth's `jwkss` collection and never leaves it.

## 2. Authorization

- Role is read from `users.role` on **every** request (`req.dbUser`), never from
  the token payload. Demoting a user takes effect immediately.
- Guards: `verifyToken`, `verifyStudent`, `verifyTutor`, `verifyAdmin`.
- Ownership is checked on every mutation, not just the route guard:
  - tuition edit/delete — caller's email must equal `tuition.tutorEmail`
  - application decision — caller's email must equal `application.tutorEmail`
  - application cancel — caller's email must equal `application.studentEmail`
- The whole admin router is guarded once with `router.use(verifyToken, verifyAdmin)`.
- Profile updates take the id from the token, so there is no id to tamper with.

## 3. Input handling

- Every body and query value is validated in `utils/validate.js` before use;
  handlers never cast raw input into a Mongo query.
- **Mass assignment** is closed by construction: `PATCH /api/tuitions/:id` ignores
  `approvalStatus`, `tutorEmail` and `isActive` is boolean-only;
  `PATCH /api/users/me` accepts only `name`, `phone`, `bio`, `image`.
- **NoSQL injection**: query parameters are coerced with `String(...)` and body
  fields are type-checked, so an object like `{ $gt: "" }` never reaches a filter.
- **Regex injection / ReDoS**: search terms go through `searchPattern()`, which
  escapes every regex metacharacter (`?search=.*` returns nothing, not everything).
- Pagination is clamped (page ≥ 1, limit 1…50), so no request can dump a collection.
- `express.json()` keeps its default 100 kB body limit.

## 4. Secrets and configuration

- `.env` is git-ignored in both repositories; `.env.example` documents every
  variable with empty values. No key is ever committed.
- The ImgBB key lives only on the server; the browser posts a file, never a key.
- CORS is restricted to `process.env.CLIENT_URL` — not `*`.
- `x-powered-by` is disabled, so responses do not advertise Express.

## 5. Error handling

- One handler produces every failure (`middleware/error.middleware.js`).
- Unknown errors return `{ success: false, error: "Internal server error" }` and
  log the real cause server-side only. Stack traces are never sent to a client.
- Duplicate keys, cast failures and body-parser errors are mapped to 400/409
  rather than 500.
- Invalid tokens are **not** logged: a bad token is a client mistake, not a
  server fault, and logging it would let an attacker write to the logs freely.

## 6. Uploads

- Auth required; one file per request; jpeg/png/webp only; 5 MB limit; memory
  storage, so nothing is written to the server's filesystem.
- ImgBB failures are reported as 502 without leaking the upstream payload.

## 7. Not implemented — recommended before a public launch

| Gap | Why it matters | Suggested fix |
| :--- | :--- | :--- |
| No rate limiting | login-adjacent and write endpoints can be hammered | `express-rate-limit` on `/api/*`, stricter on writes |
| No `helmet` | missing security headers (XCTO, frame options, referrer policy) | `helmet()` behind the API |
| MongoDB user has broad rights | a server compromise reaches every database it can see | a database-scoped Atlas user with `readWrite` on `mentorlagbe` only |
| JWKS fetched over http in dev | production must use https | set `JWKS_URL`/`JWT_ISSUER` to the deployed client origin |
| No dependency scanning | transitive packages drift | `npm audit` in CI |

## 8. Verifying

```bash
npm test        # 8 unit tests: error mapping, no database needed
npm run verify  # 100 checks against a running server, incl. the auth matrix,
                # role guards, ownership, validation and upload limits
```

The verification suite stands in for BetterAuth's JWKS with a locally derived
throwaway key, so it never touches real credentials.
