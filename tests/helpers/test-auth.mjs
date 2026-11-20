// Shared test-auth plumbing for the verification scripts.
//
// The Express API verifies JWTs against BetterAuth's JWKS endpoint, which the
// Next app serves on :3000. These scripts stand in for it with a locally
// generated Ed25519 key pair, so the API can be exercised without a browser.
//
// The key is derived from a fixed string, so every run signs with the same key.
// That matters because jose caches the JWKS inside the API process: a fresh
// random key on each run would be rejected until that cache expires.
// It is a throwaway test key, not a credential.

import http from "node:http";
import { createHash, createPrivateKey } from "node:crypto";
import { importJWK, SignJWT } from "jose";

export const ISSUER = process.env.JWT_ISSUER || "http://localhost:3000";
export const AUDIENCE = process.env.JWT_AUDIENCE || "http://localhost:3000";
export const JWKS_PORT = 3000;

function testKeyPair(seedString) {
  const seed = createHash("sha256").update(seedString).digest();
  // Standard Ed25519 PKCS#8 wrapper around a 32-byte seed.
  const pkcs8 = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]);
  const privateJwk = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" }).export({
    format: "jwk",
  });
  return {
    privateJwk,
    publicJwk: { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x },
  };
}

const mainKeys = testKeyPair("mentorlagbe-api-verification-key");
const rogueKeys = testKeyPair("mentorlagbe-rogue-key");

export const privateKey = await importJWK(mainKeys.privateJwk, "EdDSA");
export const rogueKey = await importJWK(rogueKeys.privateJwk, "EdDSA");

const jwk = { ...mainKeys.publicJwk, alg: "EdDSA", use: "sig", kid: "verify-key" };

/**
 * Serves the public half on /api/auth/jwks, the path the API looks for.
 * @returns {Promise<import("node:http").Server>}
 */
export function startJwksServer(port = JWKS_PORT) {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/auth/jwks") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

/**
 * Mints a BetterAuth-shaped token for a user document.
 * @param {{ _id: unknown, role: string }} user
 * @param {{ key?: CryptoKey, issuer?: string, audience?: string, expiresIn?: string | number, subject?: string }} [options]
 */
export function signToken(
  user,
  { key = privateKey, issuer = ISSUER, audience = AUDIENCE, expiresIn = "1h", subject } = {}
) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "EdDSA", kid: "verify-key" })
    .setSubject(subject ?? String(user._id))
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}
