import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  planName: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "usd" },
  transactionId: { type: String, required: true },
  stripeSessionId: { type: String },
  paymentStatus: { type: String, default: "paid" },
}, { timestamps: true });

export default mongoose.model("payments", paymentSchema);