import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ["student", "tutor", "admin"], default: "student" },
  image: { type: String },
  phone: { type: String },
  bio: { type: String },
  plan: { type: String, enum: ["free", "pro"], default: "free" },
  // Persistent user preferences. Nested object (no _id); defaults apply to new
  // users; older users without a settings object simply read back undefined.
  settings: {
    language: { type: String, default: "English (US)" },
    timezone: { type: String, default: "Dhaka — UTC+6 (Asia/Dhaka)" },
    mode: { type: String, default: "Offline" },
    days: { type: [String], default: ["Fri", "Sat"] },
    evenings: { type: Boolean, default: true },
    notifications: {
      applicant: { type: Boolean, default: true },
      status: { type: Boolean, default: true },
      approval: { type: Boolean, default: true },
      announcements: { type: Boolean, default: false },
      subscription: { type: Boolean, default: true },
    },
  },
}, { timestamps: true });

export default mongoose.model("users", userSchema);