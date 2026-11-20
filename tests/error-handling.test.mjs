// Verifies the central error handler in middleware/error.middleware.js.
// Runs with no database and no network: a throwaway Express app answers every
// request with one specific error type, and the test asserts the response.
//
// Run:  npm test

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import mongoose from "mongoose";
import { errorHandler, notFound } from "../middleware/error.middleware.js";
import { ApiError } from "../utils/ApiError.js";

let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());

  // A route that only succeeds when the JSON body parsed.
  app.post("/echo", (req, res) => res.json({ success: true, data: req.body }));

  // One route per error type the handler must recognise.
  app.get("/api-error", () => {
    throw new ApiError(418, "teapot", { hint: "brew" });
  });

  app.get("/async-error", async () => {
    await Promise.resolve();
    throw new ApiError(422, "async failure");
  });

  app.get("/validation", () => {
    const error = new mongoose.Error.ValidationError();
    error.addError(
      "title",
      new mongoose.Error.ValidatorError({ path: "title", message: "Title is required" })
    );
    throw error;
  });

  app.get("/cast", () => {
    throw new mongoose.Error.CastError("ObjectId", "not-an-id", "_id");
  });

  app.get("/duplicate", () => {
    const error = new Error("E11000 duplicate key error");
    error.code = 11000;
    error.keyValue = { email: "duplicate@example.com" };
    throw error;
  });

  app.get("/boom", () => {
    throw new Error("a secret internal detail");
  });

  app.use(notFound);
  app.use(errorHandler);

  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("ApiError keeps its own status and merges details", async () => {
  const res = await fetch(`${base}/api-error`);

  assert.equal(res.status, 418);
  assert.deepEqual(await res.json(), {
    success: false,
    error: "teapot",
    hint: "brew",
  });
});

test("a rejected async handler is forwarded (Express 5)", async () => {
  const res = await fetch(`${base}/async-error`);

  assert.equal(res.status, 422);
  assert.deepEqual(await res.json(), { success: false, error: "async failure" });
});

test("Mongoose ValidationError becomes a 400 naming the bad fields", async () => {
  const res = await fetch(`${base}/validation`);

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    success: false,
    error: "Validation failed",
    fields: ["title"],
  });
});

test("Mongoose CastError becomes a 400 naming the path", async () => {
  const res = await fetch(`${base}/cast`);

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), {
    success: false,
    error: 'Invalid value for "_id"',
  });
});

test("a duplicate key becomes a 409 naming the field", async () => {
  const res = await fetch(`${base}/duplicate`);

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), {
    success: false,
    error: "Duplicate value",
    fields: ["email"],
  });
});

test("malformed JSON becomes a 400, not a 500", async () => {
  const res = await fetch(`${base}/echo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid json",
  });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { success: false, error: "Invalid JSON body" });
});

test("an unknown error is a 500 that never leaks the message", async () => {
  const originalError = console.error;
  console.error = () => {}; // keep the expected log out of the test output

  try {
    const res = await fetch(`${base}/boom`);
    const body = await res.json();

    assert.equal(res.status, 500);
    assert.deepEqual(body, { success: false, error: "Internal server error" });
    assert.ok(!JSON.stringify(body).includes("secret internal detail"));
  } finally {
    console.error = originalError;
  }
});

test("an unknown route answers with a JSON 404", async () => {
  const res = await fetch(`${base}/does-not-exist`);

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), {
    success: false,
    error: "Route not found: GET /does-not-exist",
  });
});
