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
import paymentRoutes from "./routes/payment.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { notFound, errorHandler } from "./middleware/error.middleware.js";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
if (!process.env.CLIENT_URL) {
  console.warn("⚠️  CLIENT_URL is not set — CORS is limited to", CLIENT_URL);
}

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: CLIENT_URL, credentials: true }));

//webhook
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// JSON body parser
app.use(express.json());

// home route
app.get('/', (req, res) => {
  res.send('MentorLagbe Server is running!');
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "MentorLagbe Server is running!" });
});

// Auth routes
app.use("/api/auth", authRoutes);

// Tuition routes
app.use("/api/tuitions", tuitionRoutes);

// Application routes
app.use("/api/applications", applicationRoutes);

// Profile routes
app.use("/api/users", userRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);

// Dashboard statistics
app.use("/api/dashboard", dashboardRoutes);

// Image uploads
app.use("/api/upload", uploadRoutes);

// Payment routes (webhook already handled above, but router has both)
app.use("/api/payments", paymentRoutes);

// Notification routes
app.use("/api/notifications", notificationRoutes);

// No route matched → JSON 404
app.use(notFound);

// Every error, from every route, ends up here
app.use(errorHandler);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;