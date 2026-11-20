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
├─ routes/                   # auth, tuition, application (+ admin, payments: pending)
├─ utils/                    # jwt (JWKS verify), respond (shared envelope)
├─ API.md                    # the endpoint contract — read this first
└─ .env.example              # required variables
```

## Getting started

```bash
npm install
cp .env.example .env        # then fill in MONGODB_URI
npm run dev                 # nodemon on http://localhost:8000
npm start                   # production
```

Health check: `GET http://localhost:8000/api/health`

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

## Deployment

- [ ] Live API URL: `<add after deploy>`
- [ ] Set every variable from `.env.example` in the host dashboard
- [ ] `CLIENT_URL` must be the deployed client origin (CORS + JWT issuer/audience)
- [ ] Keep `MONGODB_DB=mentorlagbe` so the server reads the client's users
