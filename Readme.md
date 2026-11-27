<div align="center">

# MentorLagbe — Server

**The REST API engine for MentorLagbe, a role-aware tuition and mentorship platform connecting students, tutors, and administrators across Bangladesh.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Mongoose](https://img.shields.io/badge/Mongoose-9-880000?logo=mongodb&logoColor=white)](https://mongoosejs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?logo=vercel&logoColor=white)](https://mentor-lagbe-s.vercel.app/)

Live API: [mentor-lagbe-s.vercel.app](https://mentor-lagbe-s.vercel.app) &nbsp;|&nbsp; Frontend: [mentor-lagbe-c.vercel.app](https://mentor-lagbe-c.vercel.app)

</div>

---

## Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Getting Started](#getting-started)
5. [Environment Variables](#environment-variables)
6. [Available Scripts](#available-scripts)
7. [API Reference & Response Envelope](#api-reference--response-envelope)
8. [Authentication & RBAC](#authentication--rbac)
9. [Input Validation & Error Handling](#input-validation--error-handling)
10. [Third-Party Integrations](#third-party-integrations)
11. [Testing & Verification](#testing--verification)
12. [Deployment](#deployment)
13. [Security Posture](#security-posture)
14. [Contributing](#contributing)
15. [License & Contact](#license--contact)

---

## Overview & Architecture

MentorLagbe Server is built with **Express 5** and **Mongoose 9** on top of MongoDB Atlas. It serves as the single backend for a role-governed tuition marketplace:

- **Students**: browse public approved listings, submit applications with schedules and notes, and track application lifecycles.
- **Tutors**: publish subject-wise listings (subject to free-tier post limits), view applicants, and accept or reject applications.
- **Admins**: approve/reject tuition posts, manage user accounts, assign roles, inspect platform transactions, and broadcast notifications.

### Architectural Principles

```
  Client (Next.js / BetterAuth)
       │
       │ Bearer <BetterAuth JWT>
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Express 5 API                                               │
│                                                             │
│ 1. CORS check (origin locked to CLIENT_URL)                 │
│ 2. verifyToken (asymmetric JWKS verification via jose)      │
│ 3. req.dbUser role hydration (live read from MongoDB)       │
│ 4. Route-level RBAC (verifyStudent / verifyTutor / Admin)   │
│ 5. Centralized input validation (utils/validate.js)         │
│ 6. Centralized Error Handler (middleware/error.middleware)  │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
       MongoDB Atlas Database             External Services
   (users, tuitions, applications,      - ImgBB (Image Uploads)
    payments, notifications)            - Stripe (Subscriptions & Webhooks)
```

1. **Decoupled Auth via JWKS**: Passwords and session issuance live inside BetterAuth on the frontend. The server verifies JWT tokens asymmetrically against BetterAuth's JWKS endpoint—no shared secret key is stored on the server.
2. **Fresh Role Hydration**: Roles and plans are fetched from MongoDB on every authenticated request (`req.dbUser`), ensuring role revocations or upgrades apply immediately.
3. **Strict Validation & No Mass Assignment**: Inputs are sanitized, regexes escaped, and all update payloads explicitly whitelisted.
4. **Predictable JSON Envelope**: Every response strictly adheres to `{ success, data, message? }` or `{ success: false, error }`.

---

## Tech Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| Runtime | Node.js | >= 20 (ES Modules) | Server execution |
| Framework | Express | ^5.3.0 | API router & middleware chain |
| ODM | Mongoose | ^9.12.2 | MongoDB schema modeling & queries |
| Database | MongoDB Atlas | — | Primary persistent data store |
| JWT Verification | jose | ^6.2.18 | Asymmetric JWKS signature validation |
| Payments | Stripe SDK | ^23.2.0 | Checkout session creation & webhooks |
| Multipart Uploads | Multer | ^2.5.0 | In-memory image file processing |
| Environment | dotenv | ^18.0.10 | Environment configuration loading |
| CORS | cors | ^2.8.6 | Origin white-listing |

---

## Project Structure

```
MentorLagbe-Server/
├── config/
│   └── db.js                      # Mongoose connection with pinned dbName
├── middleware/
│   ├── auth.middleware.js         # verifyToken, verifyStudent, verifyTutor, verifyAdmin, optionalAuth
│   └── error.middleware.js        # notFound (404) and central errorHandler
├── models/
│   ├── user.model.js              # User model (name, email, role, plan, bio, settings)
│   ├── tuition.model.js           # Tuition model (title, subject, fee, approvalStatus, isActive)
│   ├── application.model.js       # Application model (student info, schedule, snapshot facts)
│   ├── notification.model.js      # Notifications (targetRole, readBy array)
│   └── payment.model.js           # Stripe transaction ledger
├── routes/
│   ├── auth.js                    # GET /api/auth/me
│   ├── user.routes.js             # PATCH /api/users/me (profile & settings)
│   ├── tuition.routes.js          # /api/tuitions CRUD & filter endpoints
│   ├── application.routes.js      # /api/applications application management
│   ├── admin.routes.js            # /api/admin/* (users, moderation, transactions, broadcast)
│   ├── dashboard.routes.js        # GET /api/dashboard/stats (role-tailored metrics)
│   ├── upload.routes.js           # POST /api/upload (ImgBB memory buffer relay)
│   ├── payment.routes.js          # /api/payments (Stripe Checkout & Webhook)
│   └── notification.routes.js     # /api/notifications (feed & mark-read)
├── utils/
│   ├── ApiError.js                # Custom error class with HTTP status codes & details
│   ├── jwt.js                     # jose JWKS client setup & verification
│   ├── respond.js                 # Unified JSON response helpers (ok, okWithMessage)
│   └── validate.js                # requireFields, requireString, requireNumberInRange, parsePagination
├── scripts/
│   └── seed.js                    # Database seeder for demo accounts & mock listings
├── tests/
│   ├── error-handling.test.mjs    # Unit tests for error handling logic
│   ├── imgbb-stub.mjs             # Mock server for image uploads
│   └── verify-api.mjs             # End-to-end API test sweep
├── index.js                       # Express app bootstrap & route mount point
├── API.md                         # Detailed API contract specification
├── SECURITY.md                    # Security audit and mitigation checklist
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js LTS 20+
- npm (package-lock.json is included)
- MongoDB instance (local or Atlas)
- Running frontend instance (or mock JWKS provider for local token testing)

### Installation

```bash
git clone <REPO_URL>
cd MentorLagbe-Server
npm install
```

### Running Locally

```bash
# Start with nodemon (auto-reload on file changes)
npm run dev

# Start in standard production mode
npm start
```

The server listens on `http://localhost:8000` (or the configured `PORT`).

---

## Environment Variables

Configure your `.env` file in the `MentorLagbe-Server` directory. Use the provided `.env.example` as a template:

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | No | `8000` | HTTP port the server binds to |
| `MONGODB_URI` | Yes | — | MongoDB Atlas connection string |
| `MONGODB_DB` | No | `mentorlagbe` | Database name (must match BetterAuth's database) |
| `CLIENT_URL` | Yes | `http://localhost:3000` | Allowed CORS origin and payment return URL |
| `JWKS_URL` | No | `http://localhost:3000/api/auth/jwks` | BetterAuth JWKS endpoint for token validation |
| `JWT_ISSUER` | No | `http://localhost:3000` | Expected JWT `iss` claim |
| `JWT_AUDIENCE` | No | `http://localhost:3000` | Expected JWT `aud` claim |
| `IMGBB_API_KEY` | Yes | — | API key for ImgBB image hosting |
| `IMGBB_API_URL` | No | `https://api.imgbb.com/1/upload` | ImgBB endpoint (can be stubbed for tests) |
| `STRIPE_SECRET_KEY` | Yes | — | Stripe API Secret Key |
| `STRIPE_PRICE_STUDENT` | Yes | — | Stripe Price ID for Student Pro subscription |
| `STRIPE_PRICE_TUTOR` | Yes | — | Stripe Price ID for Tutor Pro subscription |
| `STRIPE_WEBHOOK_SECRET` | Yes | — | Stripe Webhook signing secret (`whsec_...`) |

---

## Available Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Runs the server under `nodemon index.js` |
| `npm start` | Starts the server using Node (`node index.js`) |
| `npm test` | Runs unit tests (`node --test --test-isolation=none tests/*.test.mjs`) |
| `npm run verify` | Runs automated end-to-end API verification checks (`node tests/verify-api.mjs`) |
| `npm run seed` | Seeds demo users and tuition listings into MongoDB |
| `npm run seed:reset` | Clears demo data and restores clean seed baseline |

---

## API Reference & Response Envelope

All API endpoints produce a consistent JSON envelope. Handlers avoid manually constructing status codes on error; they throw `ApiError`, which is captured and formatted by `errorHandler`.

### Response Envelopes

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional feedback message"
}
```

**Paginated Success:**
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": "Descriptive error message",
  "fields": ["email"]
}
```

### Core Endpoint Summary

| Method | Endpoint | Auth Guard | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Public | Service health verification |
| `GET` | `/api/auth/me` | User (`verifyToken`) | Current user profile & preferences |
| `PATCH` | `/api/users/me` | User (`verifyToken`) | Update profile details and settings |
| `GET` | `/api/tuitions` | Public | Paginated list of approved, active listings |
| `GET` | `/api/tuitions/:id` | `optionalAuth` | Single tuition detail (owner can view pending/closed) |
| `GET` | `/api/tuitions/mine` | Tutor (`verifyTutor`) | Tutor's own listings (any status) |
| `POST` | `/api/tuitions` | Tutor (`verifyTutor`) | Create listing (enforces free tier 2-post limit) |
| `PATCH` | `/api/tuitions/:id` | Tutor (`verifyTutor`) | Edit owned listing |
| `DELETE` | `/api/tuitions/:id` | Tutor (`verifyTutor`) | Delete owned listing |
| `POST` | `/api/applications` | Student (`verifyStudent`) | Apply to approved tuition |
| `GET` | `/api/applications/student` | Student (`verifyStudent`) | Student's submitted applications |
| `GET` | `/api/applications/tutor` | Tutor (`verifyTutor`) | Received applications for tutor listings |
| `PATCH` | `/api/applications/:id/status` | Tutor (`verifyTutor`) | Accept or reject application |
| `DELETE` | `/api/applications/:id` | Student (`verifyStudent`) | Withdraw pending application |
| `GET` | `/api/dashboard/stats` | User (`verifyToken`) | Role-based counter aggregate |
| `POST` | `/api/upload` | User (`verifyToken`) | Proxy upload to ImgBB (JPEG/PNG/WEBP <= 5MB) |
| `POST` | `/api/payments/create-checkout-session` | User (`verifyToken`) | Generate Stripe Checkout Session |
| `POST` | `/api/payments/webhook` | Stripe Raw Signature | Handle Stripe webhook events |
| `GET` | `/api/payments/session/:sessionId` | User (`verifyToken`) | Fetch Stripe checkout session details |
| `GET` | `/api/notifications` | User (`verifyToken`) | Read notifications for user's role |
| `PATCH` | `/api/notifications/:id/read` | User (`verifyToken`) | Mark notification read for current user |
| `GET` | `/api/admin/users` | Admin (`verifyAdmin`) | Paginated user management list |
| `PATCH` | `/api/admin/users/:id/role` | Admin (`verifyAdmin`) | Change user role (prevents self-demotion) |
| `DELETE` | `/api/admin/users/:id` | Admin (`verifyAdmin`) | Delete user + clean sessions & applications |
| `GET` | `/api/admin/tuitions` | Admin (`verifyAdmin`) | Moderation queue for all tuitions |
| `PATCH` | `/api/admin/tuitions/:id/status` | Admin (`verifyAdmin`) | Approve or reject tuition listing |
| `POST` | `/api/admin/notifications` | Admin (`verifyAdmin`) | Broadcast notification |
| `GET` | `/api/admin/transactions` | Admin (`verifyAdmin`) | Payment transaction ledger |
| `GET` | `/api/admin/applications` | Admin (`verifyAdmin`) | Global application review |

*For full request/response schemas, consult [`API.md`](./API.md).*

---

## Authentication & RBAC

Authentication relies on JWTs provided in the `Authorization: Bearer <token>` header:

1. **`verifyToken`**:
   - Parses the token and invokes `verifyJwt()` (`utils/jwt.js`).
   - Checks signature via JWKS fetched from `JWKS_URL`.
   - Validates `sub` as a valid 24-character hexadecimal MongoDB ObjectId.
   - Loads the user from the database (`User.findById(userId)`). If deleted, the token is rejected even if unexpired.
   - Attaches `req.dbUser` and `req.userId`.
2. **Role Guards (`verifyStudent`, `verifyTutor`, `verifyAdmin`)**:
   - Check `req.dbUser.role` directly against the database record, never trusting the client or the JWT claims for authorization decisions.
3. **Resource Ownership Guards**:
   - Modifying a tuition checks `tuition.tutorEmail === req.dbUser.email`.
   - Modifying an application status checks `application.tutorEmail === req.dbUser.email`.
   - Canceling an application checks `application.studentEmail === req.dbUser.email`.

---

## Input Validation & Error Handling

All validation logic is centralized in `utils/validate.js`:
- `isObjectId(val)`: validates MongoDB ID format to prevent CastErrors.
- `requireFields(body, [...])`: rejects missing required body properties with a 400.
- `requireString(val, field, opts)`: validates strings and handles minimum lengths.
- `requireNumberInRange(val, field, opts)`: validates numeric inputs within bounds.
- `requireOneOf(val, field, allowed)`: enum check against allowed literals.
- `searchPattern(term)`: sanitizes search inputs by escaping regex characters to prevent ReDoS.
- `parsePagination(query, opts)`: clamps `limit` (max 50) and `page` to prevent collection dumping.

### Error Pipeline (`middleware/error.middleware.js`)
All route errors funnel into the global error handler:
- `ApiError`: returns explicit status and detail payloads.
- `entity.parse.failed`: catches malformed JSON from Express with a 400 status.
- `MulterError`: formats file upload limit violations.
- `ValidationError` / `CastError`: formats Mongoose constraint violations to 400.
- Mongo Error `11000`: maps duplicate keys to 409 Conflict.
- Unhandled exceptions: logged on the server; client receives an opaque `{ "success": false, "error": "Internal server error" }`.

---

## Third-Party Integrations

### Stripe Integration
- **Subscriptions**: creates checkout sessions for `student` or `tutor` pro plans.
- **Webhook Endpoint**: mounted at `/api/payments/webhook` using `express.raw({ type: "application/json" })` for cryptographic signature validation before the JSON parser runs.
- **Idempotency**: checks `stripeSessionId` on `payments` collection before processing duplicate webhook calls.

### ImgBB Proxy
- Image uploads (`POST /api/upload`) accept single files via Multer `memoryStorage`.
- Supports `image/jpeg`, `image/png`, and `image/webp` up to 5 MB.
- Relayed directly as a base64 payload to ImgBB using native Node `fetch`.
- Keeps the `IMGBB_API_KEY` private on the server.

---

## Testing & Verification

The server includes both lightweight unit tests and integration verification scripts:

```bash
# 1. Run unit tests (error handling & schema behavior)
npm test

# 2. Run comprehensive API verification
npm run verify
```

The verification suite runs over 100 checks covering authentication matrices, role barriers, resource ownership, input validation, and boundary conditions.

---

## Deployment

The server is optimized for serverless deployment on **Vercel**:

- Root directory: `MentorLagbe-Server`
- Entry point: `index.js`
- Export: `export default app;`
- Production URL: [https://mentor-lagbe-s.vercel.app](https://mentor-lagbe-s.vercel.app)

Ensure all environment variables from the [Environment Variables](#environment-variables) section are defined in your deployment dashboard.

---

## Security Posture

Detailed security controls are documented in [`SECURITY.md`](./SECURITY.md). Key measures include:

- **No Secrets in Repo**: `.env` is git-ignored, and no tokens or DB credentials are baked in.
- **Asymmetric Token Verification**: JWKS prevents token forgery even if server environment variables were exposed.
- **No Mass Assignment**: `PATCH` endpoints whitelist allowed fields and reject unknown keys.
- **Express Fingerprinting Removed**: `app.disable("x-powered-by")` is invoked.
- **Safe CORS**: Origin restricted strictly to `CLIENT_URL`.

---

## Contributing

1. Fork the repository and create a feature branch (`git checkout -b feature/name`).
2. Write small, focused commits using Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`).
3. Ensure `npm test` passes before committing.
4. Submit a Pull Request describing the changes and associated issue.

---

## License & Contact

### License
This project is licensed under the **ISC License** (see `package.json`).

### Contact
- **Maintainer**: Aminul Islam
- **Email**: [aminulislam424842@gmail.com](mailto:aminulislam424842@gmail.com)
- **GitHub**: [github.com/aminulislamdev](https://github.com/aminulislamdev)
- **Issues**: [GitHub Issues](https://github.com/aminulislamdev/Mentor-Lagbe-Server/issues)
