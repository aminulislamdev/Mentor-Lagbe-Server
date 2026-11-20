import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import "./config/db.js";
import authRoutes from "./routes/auth.js";
import tuitionRoutes from "./routes/tuition.routes.js";
import applicationRoutes from "./routes/application.routes.js";

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

// Unknown route → JSON 404 instead of Express' default HTML page, so the
// client's fetch wrapper can always parse the response.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Central error handler. Express 5 forwards rejected async handlers here,
// so an unexpected throw still returns the standard error envelope.
// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  if (res.headersSent) return next(error);
  res.status(500).json({ success: false, error: "Internal server error" });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});