import { jwtVerify, createRemoteJWKSet } from 'jose';

// Environment-variable-driven configuration so the JWKS URL, issuer,
// and audience can be changed without touching code.
const JWKS_URL = process.env.JWKS_URL || "http://localhost:3000/api/auth/jwks";
const JWT_ISSUER = process.env.JWT_ISSUER || "http://localhost:3000";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "http://localhost:3000";

const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export async function verifyToken(token) {
  // Throws if the signature, issuer, audience or expiry is wrong.
  // authMiddleware turns that into a 401 — no logging here on purpose, a bad
  // token is a normal client mistake, not a server problem.
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  return payload;
}