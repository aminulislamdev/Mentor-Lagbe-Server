import mongoose from "mongoose";

const applicationSchema = new mongoose.Schema({
  tuitionId: { type: String, required: true },
  tuitionTitle: { type: String, required: true },
  subject: { type: String, required: true },
  monthlyFee: { type: Number, required: true },
  tutorEmail: { type: String, required: true },
  studentName: { type: String, required: true },
  studentEmail: { type: String, required: true },
  studentPhone: { type: String, required: true },
  preferredSchedule: { type: String, required: true },
  studentNote: { type: String },
  status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
  // Kept alongside `createdAt` (timestamps) so API responses expose the field
  // name the assignment spec documents: applications.appliedAt
  appliedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Both dashboards query the applications collection by owner email.
applicationSchema.index({ studentEmail: 1, appliedAt: -1 });
applicationSchema.index({ tutorEmail: 1, appliedAt: -1 });

export default mongoose.model("applications", applicationSchema);