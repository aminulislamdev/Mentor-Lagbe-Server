// End-to-end API sweep.
//
// The Express server verifies JWTs against BetterAuth's JWKS endpoint. This
// script stands in for the Next app's /api/auth/jwks (port 3000) with its own
// Ed25519 key pair, mints tokens for three test roles, and then exercises every
// endpoint — including the authenticated 201/200 paths that a browser-less
// environment otherwise cannot reach.
//
// It writes only throwaway data (emails starting with "verify.") and removes it
// at the end. Admin moderation is not built yet (Task 6), so where an approval
// is needed it is applied directly in MongoDB and labelled as such.
//
// Usage:  node tests/verify-api.mjs        (Express server must be running)

import http from "node:http";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import mongoose from "mongoose";
import "dotenv/config";

const API = process.env.API_URL || "http://localhost:8000";
const ISSUER = process.env.JWT_ISSUER || "http://localhost:3000";
const AUDIENCE = process.env.JWT_AUDIENCE || "http://localhost:3000";
const JWKS_PORT = 3000;

const results = [];
async function check(label, fn) {
  try {
    await fn();
    results.push({ label, ok: true });
    console.log(`PASS  ${label}`);
  } catch (error) {
    results.push({ label, ok: false, error: error.message });
    console.log(`FAIL  ${label}\n      ${error.message}`);
  }
}

// ── 1. A stand-in for BetterAuth's JWKS endpoint ────────────────────────────
const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
  crv: "Ed25519",
  extractable: true,
});
const jwk = await exportJWK(publicKey);
Object.assign(jwk, { alg: "EdDSA", use: "sig", kid: "verify-key" });

const jwksServer = http.createServer((req, res) => {
  if (req.url === "/api/auth/jwks") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ keys: [jwk] }));
    return;
  }
  res.writeHead(404);
  res.end();
});
await new Promise((resolve) => jwksServer.listen(JWKS_PORT, resolve));

// ── 2. Test users, tokens ───────────────────────────────────────────────────
await mongoose.connect(process.env.MONGODB_URI, { dbName: "mentorlagbe" });
const db = mongoose.connection.db;
const users = db.collection("users");
const tuitions = db.collection("tuitions");
const applications = db.collection("applications");

const TEST_EMAILS = [
  "verify.student@mentorlagbe.com",
  "verify.tutor1@mentorlagbe.com",
  "verify.tutor2@mentorlagbe.com",
  "verify.admin@mentorlagbe.com",
];

async function cleanup() {
  await applications.deleteMany({
    $or: [{ studentEmail: { $in: TEST_EMAILS } }, { tutorEmail: { $in: TEST_EMAILS } }],
  });
  await tuitions.deleteMany({ tutorEmail: { $in: TEST_EMAILS } });
  await users.deleteMany({ email: { $in: TEST_EMAILS } });
}

await cleanup(); // start from a clean slate even if a previous run died

const people = [
  { email: TEST_EMAILS[0], name: "Verify Student", role: "student" },
  { email: TEST_EMAILS[1], name: "Verify Tutor One", role: "tutor" },
  { email: TEST_EMAILS[2], name: "Verify Tutor Two", role: "tutor" },
  { email: TEST_EMAILS[3], name: "Verify Admin", role: "admin" },
];

const docs = {};
for (const person of people) {
  const doc = {
    ...person,
    plan: "free",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const { insertedId } = await users.insertOne(doc);
  docs[person.role === "tutor" ? person.email : person.role] = { _id: insertedId, ...doc };
}

const tokenFor = (user) =>
  new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "EdDSA", kid: "verify-key" })
    .setSubject(String(user._id))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

const student = await tokenFor(docs.student);
const tutor1 = await tokenFor(docs[TEST_EMAILS[1]]);
const tutor2 = await tokenFor(docs[TEST_EMAILS[2]]);
const admin = await tokenFor(docs.admin);

// ── 3. Request helper ───────────────────────────────────────────────────────
async function api(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, body: json };
}

const tuitionBody = (overrides = {}) => ({
  title: "Verification Batch",
  subject: "Physics",
  classLevel: "HSC",
  mode: "Online",
  location: "Online",
  monthlyFee: 3000,
  daysPerWeek: 2,
  bannerImage: "https://example.com/banner.png",
  description: "Created by the verification sweep.",
  ...overrides,
});

const applicationBody = (tuitionId, overrides = {}) => ({
  tuitionId,
  studentPhone: "01712345678",
  preferredSchedule: "Sat-Mon 5 PM",
  studentNote: "Verification application",
  ...overrides,
});

try {
  // ── Auth ──────────────────────────────────────────────────────────────────
  await check("GET /api/auth/me as student", async () => {
    const { status, body } = await api("/api/auth/me", { token: student });
    assert.equal(status, 200);
    assert.equal(body.user.role, "student");
    assert.equal(body.user.email, TEST_EMAILS[0]);
  });

  await check("GET /api/auth/me as tutor", async () => {
    const { status, body } = await api("/api/auth/me", { token: tutor1 });
    assert.equal(status, 200);
    assert.equal(body.user.role, "tutor");
  });

  await check("GET /api/auth/me as admin", async () => {
    const { status, body } = await api("/api/auth/me", { token: admin });
    assert.equal(status, 200);
    assert.equal(body.user.role, "admin");
  });

  await check("GET /api/auth/me without a token → 401", async () => {
    const { status, body } = await api("/api/auth/me");
    assert.equal(status, 401);
    assert.equal(body.success, false);
  });

  // ── Tuition create + validation ───────────────────────────────────────────
  await check("POST /api/tuitions rejects missing fields", async () => {
    const { status, body } = await api("/api/tuitions", {
      method: "POST",
      token: tutor1,
      body: { title: "Only a title" },
    });
    assert.equal(status, 400);
    assert.ok(body.missingFields.length > 0);
  });

  await check("POST /api/tuitions rejects a bad mode", async () => {
    const { status } = await api("/api/tuitions", {
      method: "POST",
      token: tutor1,
      body: tuitionBody({ mode: "Hologram" }),
    });
    assert.equal(status, 400);
  });

  await check("POST /api/tuitions rejects a fee that is not a number", async () => {
    const { status } = await api("/api/tuitions", {
      method: "POST",
      token: tutor1,
      body: tuitionBody({ monthlyFee: "free" }),
    });
    assert.equal(status, 400);
  });

  let tuition1;
  await check("POST /api/tuitions creates a pending listing (201)", async () => {
    const { status, body } = await api("/api/tuitions", {
      method: "POST",
      token: tutor1,
      body: tuitionBody({ title: "Verification Physics Batch" }),
    });
    assert.equal(status, 201);
    assert.equal(body.data.approvalStatus, "pending");
    assert.equal(body.data.tutorEmail, TEST_EMAILS[1]);
    tuition1 = body.data._id;
  });

  await check("a pending listing is hidden from the public", async () => {
    const { status } = await api(`/api/tuitions/${tuition1}`);
    assert.equal(status, 404);
  });

  await check("GET /api/tuitions/mine shows it to its owner", async () => {
    const { status, body } = await api("/api/tuitions/mine", { token: tutor1 });
    assert.equal(status, 200);
    assert.ok(body.data.some((t) => t._id === tuition1));
  });

  await check("a student cannot post a tuition (403)", async () => {
    const { status } = await api("/api/tuitions", {
      method: "POST",
      token: student,
      body: tuitionBody(),
    });
    assert.equal(status, 403);
  });

  await check("another tutor cannot patch it (403)", async () => {
    const { status } = await api(`/api/tuitions/${tuition1}`, {
      method: "PATCH",
      token: tutor2,
      body: { monthlyFee: 1 },
    });
    assert.equal(status, 403);
  });

  await check("the owner can patch it (200)", async () => {
    const { status, body } = await api(`/api/tuitions/${tuition1}`, {
      method: "PATCH",
      token: tutor1,
      body: { monthlyFee: 4200 },
    });
    assert.equal(status, 200);
    assert.equal(body.data.monthlyFee, 4200);
  });

  await check("a tutor cannot approve their own listing", async () => {
    const { status } = await api(`/api/tuitions/${tuition1}`, {
      method: "PATCH",
      token: tutor1,
      body: { approvalStatus: "approved" },
    });
    assert.equal(status, 400); // unknown field → nothing to update
  });

  await check("an empty patch is rejected", async () => {
    const { status } = await api(`/api/tuitions/${tuition1}`, {
      method: "PATCH",
      token: tutor1,
      body: {},
    });
    assert.equal(status, 400);
  });

  // Admin moderation routes arrive in Task 6, so approve straight in Mongo here.
  await tuitions.updateOne({ _id: new mongoose.Types.ObjectId(tuition1) }, {
    $set: { approvalStatus: "approved" },
  });

  await check("an approved listing is public (200)", async () => {
    const { status, body } = await api(`/api/tuitions/${tuition1}`);
    assert.equal(status, 200);
    assert.equal(body.data._id, tuition1);
  });

  await check("toggling isActive false hides it, true shows it again", async () => {
    const off = await api(`/api/tuitions/${tuition1}`, {
      method: "PATCH",
      token: tutor1,
      body: { isActive: false },
    });
    assert.equal(off.status, 200);
    assert.equal((await api(`/api/tuitions/${tuition1}`)).status, 404);

    const on = await api(`/api/tuitions/${tuition1}`, {
      method: "PATCH",
      token: tutor1,
      body: { isActive: true },
    });
    assert.equal(on.status, 200);
    assert.equal((await api(`/api/tuitions/${tuition1}`)).status, 200);
  });

  let tuition2;
  await check("a second listing is created (still pending)", async () => {
    const { status, body } = await api("/api/tuitions", {
      method: "POST",
      token: tutor1,
      body: tuitionBody({ title: "Verification IELTS Batch", subject: "IELTS" }),
    });
    assert.equal(status, 201);
    tuition2 = body.data._id;
  });

  await check("the free plan blocks a third active listing (403)", async () => {
    const { status, body } = await api("/api/tuitions", {
      method: "POST",
      token: tutor1,
      body: tuitionBody({ title: "Verification Third Batch" }),
    });
    assert.equal(status, 403);
    assert.match(body.error, /Free plan limit/);
  });

  // ── Applications ──────────────────────────────────────────────────────────
  await check("applying to a non-approved listing → 404", async () => {
    const { status } = await api("/api/applications", {
      method: "POST",
      token: student,
      body: applicationBody(tuition2),
    });
    assert.equal(status, 404);
  });

  await check("applying with a bad tuitionId → 400", async () => {
    const { status } = await api("/api/applications", {
      method: "POST",
      token: student,
      body: applicationBody("not-an-id"),
    });
    assert.equal(status, 400);
  });

  let application1;
  await check("a student applies to an approved listing (201)", async () => {
    const { status, body } = await api("/api/applications", {
      method: "POST",
      token: student,
      body: applicationBody(tuition1),
    });
    assert.equal(status, 201);
    assert.equal(body.data.status, "pending");
    assert.equal(body.data.tutorEmail, TEST_EMAILS[1]);
    application1 = body.data._id;
  });

  await check("a duplicate application → 409", async () => {
    const { status, body } = await api("/api/applications", {
      method: "POST",
      token: student,
      body: applicationBody(tuition1),
    });
    assert.equal(status, 409);
    assert.match(body.error, /already applied/);
  });

  await check("the student sees their application", async () => {
    const { status, body } = await api("/api/applications/student", { token: student });
    assert.equal(status, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0]._id, application1);
  });

  await check("the owning tutor sees it", async () => {
    const { status, body } = await api("/api/applications/tutor", { token: tutor1 });
    assert.equal(status, 200);
    assert.equal(body.data.length, 1);
  });

  await check("another tutor sees none of it", async () => {
    const { status, body } = await api("/api/applications/tutor", { token: tutor2 });
    assert.equal(status, 200);
    assert.equal(body.data.length, 0);
  });

  await check("another tutor cannot decide on it (403)", async () => {
    const { status } = await api(`/api/applications/${application1}/status`, {
      method: "PATCH",
      token: tutor2,
      body: { status: "accepted" },
    });
    assert.equal(status, 403);
  });

  await check("the tutor accepts it (200)", async () => {
    const { status, body } = await api(`/api/applications/${application1}/status`, {
      method: "PATCH",
      token: tutor1,
      body: { status: "accepted" },
    });
    assert.equal(status, 200);
    assert.equal(body.data.status, "accepted");
  });

  await check("an invalid decision is rejected (400)", async () => {
    const { status } = await api(`/api/applications/${application1}/status`, {
      method: "PATCH",
      token: tutor1,
      body: { status: "maybe" },
    });
    assert.equal(status, 400);
  });

  await check("the student cannot cancel an accepted application (409)", async () => {
    const { status } = await api(`/api/applications/${application1}`, {
      method: "DELETE",
      token: student,
    });
    assert.equal(status, 409);
  });

  await check("a student cannot decide applications (403)", async () => {
    const { status } = await api(`/api/applications/${application1}/status`, {
      method: "PATCH",
      token: student,
      body: { status: "accepted" },
    });
    assert.equal(status, 403);
  });

  await check("a tutor cannot use the student list (403)", async () => {
    const { status } = await api("/api/applications/student", { token: tutor1 });
    assert.equal(status, 403);
  });

  await check("a pending application can be withdrawn (200)", async () => {
    await tuitions.updateOne({ _id: new mongoose.Types.ObjectId(tuition2) }, {
      $set: { approvalStatus: "approved" },
    });

    const created = await api("/api/applications", {
      method: "POST",
      token: student,
      body: applicationBody(tuition2),
    });
    assert.equal(created.status, 201);

    const removed = await api(`/api/applications/${created.body.data._id}`, {
      method: "DELETE",
      token: student,
    });
    assert.equal(removed.status, 200);
  });

  // ── Search + misc ─────────────────────────────────────────────────────────
  await check("search matching finds the created batch", async () => {
    const { status, body } = await api("/api/tuitions?search=verification");
    assert.equal(status, 200);
    assert.ok(body.pagination.total >= 2);
  });

  await check("page size is capped at 50", async () => {
    const { body } = await api("/api/tuitions?limit=9999");
    assert.equal(body.pagination.limit, 50);
  });

  await check("an unknown route returns a JSON 404", async () => {
    const { status, body } = await api("/api/does-not-exist");
    assert.equal(status, 404);
    assert.equal(body.success, false);
  });

  await check("the owner can delete their listing (200)", async () => {
    const { status } = await api(`/api/tuitions/${tuition2}`, {
      method: "DELETE",
      token: tutor1,
    });
    assert.equal(status, 200);
  });

  await check("a deleted listing is gone (404)", async () => {
    const { status } = await api(`/api/tuitions/${tuition2}`);
    assert.equal(status, 404);
  });
} finally {
  await cleanup();
  await mongoose.disconnect();
  jwksServer.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exitCode = 1;
