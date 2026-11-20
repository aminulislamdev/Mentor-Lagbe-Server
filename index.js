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
import { notFound, errorHandler } from "./middleware/error.middleware.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
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

// No route matched → JSON 404
app.use(notFound);

// Every error, from every route, ends up here
app.use(errorHandler);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
