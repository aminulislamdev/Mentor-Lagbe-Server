# MentorLagbe — Server

Express 5 + MongoDB API for **MentorLagbe**, a role-based tuition and mentorship
platform (students apply to tutor batches; tutors manage listings and applicants;
admins moderate listings, users and subscription revenue).

The Next.js client lives in `MentorLagbe-Client/my-app`. Both apps share one
BetterAuth instance and one MongoDB database (`mentorlagbe`), so the JWT issued by
the client is verified here through BetterAuth's JWKS endpoint.

## Stack

| Layer | Choice |
| :--- | :--- |
| Runtime | Node.js (ES modules) |
| HTTP | Express 5 |
| Database | MongoDB Atlas via Mongoose 9 |
| Auth | BetterAuth (client) + `jose` JWKS verification (server) |
| Config | `dotenv` |

## Structure

```
MentorLagbe-Server/
├─ index.js                  # app entry: middleware, route mounts, 404/error handlers
├─ config/db.js              # Mongoose connection (pinned to MONGODB_DB)
├─ middleware/auth.middleware.js  # authMiddleware, verifyStudent, verifyTutor, verifyAdmin
├─ models/                   # users, tuitions, applications, payments
├─ routes/                   # auth, users, tuition, applications, admin, dashboard, upload
├─ utils/                    # jwt (JWKS verify), respond (success envelope), validate, ApiError
├─ middleware/               # verifyToken + role guards, central error handler
├─ tests/                    # unit tests + end-to-end sweep + ImgBB stub
├─ API.md                    # the endpoint contract — read this first
├─ SECURITY.md               # security review and hardening checklist
└─ .env.example              # required variables
```

## Getting started

```bash
npm install
cp .env.example .env        # then fill in MONGODB_URI (+ IMGBB_API_KEY for uploads)
npm run dev                 # nodemon on http://localhost:8000
npm start                   # production

npm test                    # unit tests, no database needed
npm run verify              # full API sweep against a running server
```

Health check: `GET http://localhost:8000/api/health`

## Security

`SECURITY.md` is the review: how tokens are verified, how ownership and roles are
enforced, what is closed (mass assignment, NoSQL/regex injection, pagination
abuse, upload limits) and what is still recommended before a public launch
(rate limiting, helmet, least-privilege database user).

## Environment variables

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `PORT` | no (default `8000`) | HTTP port |
| `CLIENT_URL` | yes | CORS origin + BetterAuth issuer/audience |
| `MONGODB_URI` | yes | Atlas connection string |
| `MONGODB_DB` | no (default `mentorlagbe`) | Database name — must match the client |
| `JWKS_URL` | no | Defaults to `${CLIENT_URL}/api/auth/jwks` |
| `JWT_ISSUER` / `JWT_AUDIENCE` | no | Default to `CLIENT_URL` |

Stripe and ImgBB keys are added when those routes land (see `API.md`).

## API

See [API.md](./API.md) for the full contract: envelope, guards, every endpoint,
and the decided business rules.

Implemented so far: auth check, tuition browse/search/pagination, tutor tuition
CRUD with the free-plan limit, and the full application flow.

## Demo data

```bash
npm run seed                  # accounts (client must be running) + 12 tuitions + 5 applications
npm run seed -- --skip-users  # tuition data only, for accounts that already exist
npm run seed:reset            # remove everything the seed created
```

Accounts are created through BetterAuth's sign-up endpoint, because only
BetterAuth can hash a password — an inserted user document could never log in.
So start the client first, then run the seed. Re-running is safe: the script
deletes only its own rows (matching the emails below) before inserting.

| Role | Email | Password |
| :--- | :--- | :--- |
| Admin | `admin@mentorlagbe.com` | `mentorlagbe123` |
| Tutor (Pro) | `tutor.tanvir@mentorlagbe.com` | `mentorlagbe123` |
| Tutor (Free) | `tutor.samia@mentorlagbe.com` | `mentorlagbe123` |
| Student | `student.tasnim@mentorlagbe.com` | `mentorlagbe123` |

The 12 tuitions cover Mathematics, Physics, Chemistry, Biology, English, IELTS,
Programming and Accounting; 10 are approved, one is pending and one rejected, so
the moderation queue and the tutor dashboard both have something to show. The
five applications connect the demo students to those listings with a mix of
pending, accepted and rejected states.

## Deployment

- [ ] Live API URL: `<add after deploy>`
- [ ] Set every variable from `.env.example` in the host dashboard
- [ ] `CLIENT_URL` must be the deployed client origin (CORS + JWT issuer/audience)
- [ ] Keep `MONGODB_DB=mentorlagbe` so the server reads the client's users
