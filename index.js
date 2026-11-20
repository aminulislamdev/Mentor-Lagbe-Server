import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import "./config/db.js";
import authRoutes from "./routes/auth.js";
import tuitionRoutes from "./routes/tuition.routes.js";
import applicationRoutes from "./routes/application.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";

// cors() defaults to "*" when the origin is undefined, which would silently open
// the API to every site. Fall back to the dev origin and say so out loud instead.
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
if (!process.env.CLIENT_URL) {
  console.warn("⚠️  CLIENT_URL is not set — CORS is limited to", CLIENT_URL);
}

const app = express();
// Do not advertise the framework in every response.
app.disable("x-powered-by");
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

// home route
app.get('/',(req, res) => {
  res.send('MentorLagbe Server is running!');
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "MentorLagbe Server is running!" });
});

// Auth routes (protected test endpoint)
app.use("/api/auth", authRoutes);

// Tuition routes (public reads + tutor-protected writes)
app.use("/api/tuitions", tuitionRoutes);

// Application routes (student submits, tutor decides)
app.use("/api/applications", applicationRoutes);

// Profile routes (update own account)
app.use("/api/users", userRoutes);

// Admin routes (user roles, tuition moderation) — admin only, guarded in the file
app.use("/api/admin", adminRoutes);

// Dashboard statistics, shaped by the caller's role
app.use("/api/dashboard", dashboardRoutes);

// Image uploads (multipart → ImgBB → hosted URL)
app.use("/api/upload", uploadRoutes);

// No route matched → JSON 404
app.use(notFound);

// Every error, from every route, ends up here
app.use(errorHandler);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
