import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// BetterAuth (in the client app) writes to the "mentorlagbe" database.
// An Atlas URI without a path segment falls back to the default "test" database,
// which would make every user lookup in auth.middleware.js miss. Pin it explicitly.
const DB_NAME = process.env.MONGODB_DB || "mentorlagbe";

try {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME });
  console.log(`✅ MongoDB connected (db: ${DB_NAME})`);
} catch (error) {
  console.error("❌ MongoDB connection failed:", error);
  process.exit(1);
}