import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import "./config/db.js";
import authRoutes from "./routes/auth.js";
import tuitionRoutes from "./routes/tuition.routes.js";
import applicationRoutes from "./routes/application.routes.js";
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

// No route matched → JSON 404
app.use(notFound);

// Every error, from every route, ends up here
app.use(errorHandler);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
