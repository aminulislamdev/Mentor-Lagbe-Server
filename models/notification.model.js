import mongoose from "mongoose";

// One admin notification shown to students/tutors.
// readBy holds MongoDB User ids of users who have read it.
const notificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    targetRole: {
      type: String,
      required: true,
      enum: ["all", "student", "tutor"],
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "users", default: [] }],
  },
  { timestamps: true }
);

export default mongoose.model("notifications", notificationSchema);
