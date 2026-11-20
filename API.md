# MentorLagbe — API Contract

Base URL (dev): `http://localhost:8000` · Health: `GET /api/health`

Everything below is the source of truth for the Next.js client. If a route is
not listed here, it does not exist yet.

---

## 1. Response envelope

Every endpoint answers with the same shape, so the client never needs a
per-route special case:

| Case | Body |
| :--- | :--- |
| Success | `{ "success": true, "data": … }` |
| Success + message | `{ "success": true, "message": "…", "data": … }` |
| Failure | `{ "success": false, "error": "…" }` |

A paginated list adds a `pagination` sibling to `data`:

```json
{ "success": true, "data": [ … ], "pagination": { "total": 12, "page": 1, "limit": 10, "totalPages": 2 } }
```

| Status | Meaning |
| :--- | :--- |
| 400 | Validation failure (bad id, missing/invalid field) |
| 401 | No/invalid/expired token, or the user no longer exists |
| 403 | Authenticated but wrong role, or not the owner of the resource |
| 404 | Resource missing, or not publicly visible |
| 409 | Conflict (duplicate application, cannot cancel a decided application) |
| 500 | Unhandled server error (message is always generic) |

Failures are classified in exactly one place, `middleware/error.middleware.js`:

| Cause | Result |
| :--- | :--- |
| `throw new ApiError(status, message, details?)` in a route | that status, `details` merged into the body |
| Mongoose validation failed | `400` + `fields: [...]` |
| value could not be cast (malformed ObjectId) | `400` |
| duplicate unique key | `409` + `fields: [...]` |
| anything unclassified | `500`, logged server-side, generic message only |

Routes therefore never build error responses by hand, and never need `try/catch`:
Express 5 forwards a rejected async handler straight to the handler.

---

## 2. Authentication

Protected routes expect `Authorization: Bearer <jwt>`.

The JWT is **issued by BetterAuth in the client app** and verified by the server
against BetterAuth's JWKS endpoint (`jose`), so both apps must share the same
`mentorlagbe` database and the same auth origin.

```
GET {CLIENT_URL}/api/auth/token      →  { "token": "<jwt>" }   (requires the session cookie)
```

Role checks always read `users.role` from MongoDB (`req.dbUser`), never the token
payload — a demoted user loses access immediately.

| Guard | Allows |
| :--- | :--- |
| `authMiddleware` | any signed-in user |
| `verifyStudent` | `role === "student"` |
| `verifyTutor` | `role === "tutor"` |
| `verifyAdmin` | `role === "admin"` |

---

## 3. Endpoints

### Auth

| Method | Path | Guard | Notes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/me` | any | `{ user: { id, name, email, role, plan, image, phone, bio, createdAt } }` — the only endpoint using `{ user }` instead of `{ data }` |

### Tuitions

| Method | Path | Guard | Request | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/tuitions` | public | query: `search`, `subject`, `classLevel` (alias `class`), `mode`, `page`, `limit` | only `approvalStatus: "approved"` + `isActive: true`; `search` matches **title or subject**; `limit` capped at 50 |
| `GET` | `/api/tuitions/mine` | tutor | — | every listing owned by the caller, all approval/active states, newest first |
| `GET` | `/api/tuitions/:id` | public | — | 404 unless approved **and** active |
| `POST` | `/api/tuitions` | tutor | `title, subject, classLevel, mode, location, monthlyFee, daysPerWeek, bannerImage, description` | saved as `pending`; free plan limited to **2 active** listings |
| `PATCH` | `/api/tuitions/:id` | tutor (owner) | any of the POST fields + `isActive` | `approvalStatus` is **not** writable here; owner only |
| `DELETE` | `/api/tuitions/:id` | tutor (owner) | — | hard delete |

### Applications

| Method | Path | Guard | Request | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/applications` | student | `tuitionId, studentPhone, preferredSchedule, studentNote?` | tuition must be approved + active; duplicates return 409; tuition facts are snapshotted onto the application |
| `GET` | `/api/applications/student` | student | — | caller's own applications, newest first |
| `GET` | `/api/applications/tutor` | tutor | `?tuitionId` (optional) | applicants across the caller's listings |
| `PATCH` | `/api/applications/:id/status` | tutor (owner) | `status: "accepted" \| "rejected"` | re-sending the current status is a no-op success |
| `DELETE` | `/api/applications/:id` | student (owner) | — | only while `status === "pending"`; otherwise 409 |

### Not built yet

`PATCH /api/users/me` (profile) · `/api/admin/*` (users, moderation, transactions) ·
`POST /api/upload` (ImgBB) · `/api/payments/*` (Stripe checkout, verify, webhook).

---

## 4. Business rules, decided once

- **Free plan** — a `free` tutor may hold **2 active** listings. Closing a listing
  (`isActive: false`) frees a slot. Pro is unlimited.
- **Moderation** — only admin routes may change `approvalStatus`. Tutor writes can
  never touch it, so a tutor cannot self-approve.
- **One active application** — per `(tuitionId, studentEmail)` with status
  `pending` or `accepted`. Re-applying after a rejection is allowed.
- **Snapshots** — an application stores `tuitionTitle`, `subject`, `monthlyFee`
  and `tutorEmail` at submit time, so the student's ledger stays intact if the
  tutor edits or deletes the listing.
- **Roles** — read from MongoDB on every request, never from the JWT.

---

## 5. Manual smoke test

```powershell
# 1) sign in on the client (:3000) and keep the session cookie
Invoke-WebRequest -Method Post http://localhost:3000/api/auth/sign-in/email `
  -ContentType 'application/json' `
  -Body (@{ email = 'tutor1@mentorlagbe.com'; password = 'mentorlagbe' } | ConvertTo-Json) `
  -SessionVariable sess | Out-Null

# 2) exchange the session for the JWT the Express server verifies
$env:TOKEN = (Invoke-RestMethod http://localhost:3000/api/auth/token -WebSession $sess).token

# 3) call the API
Invoke-RestMethod http://localhost:8000/api/auth/me -Headers @{ Authorization = "Bearer $env:TOKEN" }
Invoke-RestMethod "http://localhost:8000/api/tuitions?search=physics&page=1&limit=6"
Invoke-RestMethod http://localhost:8000/api/tuitions/mine -Headers @{ Authorization = "Bearer $env:TOKEN" }
Invoke-RestMethod http://localhost:8000/api/applications/tutor -Headers @{ Authorization = "Bearer $env:TOKEN" }
```
