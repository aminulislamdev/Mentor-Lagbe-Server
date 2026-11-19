import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, enum: ["student", "tutor", "admin"], default: "student" },
  image: { type: String },
  phone: { type: String },
  bio: { type: String },
  plan: { type: String, enum: ["free", "pro"], default: "free" },
}, { timestamps: true });

export default mongoose.model("users", userSchema);