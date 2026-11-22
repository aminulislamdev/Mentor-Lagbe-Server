import express from "express";
import Stripe from "stripe";
import { verifyToken } from "../middleware/auth.middleware.js";
import User from "../models/user.model.js";
import Payment from "../models/payment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ok } from "../utils/respond.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ১. Checkout Session তৈরি করা
router.post("/create-checkout-session", verifyToken, async (req, res) => {
  try {
    const { plan } = req.body;
    let priceId;

    if (plan === "student") priceId = process.env.STRIPE_PRICE_STUDENT;
    else if (plan === "tutor") priceId = process.env.STRIPE_PRICE_TUTOR;
    else throw new ApiError(400, "Invalid plan selected");

    if (!priceId) {
      console.error("❌ Error: Stripe Price ID is missing in .env file");
      throw new ApiError(500, "Price ID not configured on server");
    }

    // ✅ Stripe Checkout Session তৈরি
    const session = await stripe.checkout.sessions.create({
      // ❌ payment_method_types: ["card"] -> এটি Stripe-এর নতুন আপডেটে বাদ দিতে হবে
      mode: "subscription",
      customer_email: req.dbUser.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        userId: req.dbUser._id.toString(),
        userEmail: req.dbUser.email,
        userRole: req.dbUser.role,
        planName: plan === "student" ? "Student Pro" : "Tutor Pro",
      },
      // CLIENT_URL না থাকলে ফলব্যাক হিসেবে localhost ব্যবহার করবে
      success_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || "http://localhost:3000"}/payment/cancel`,
    });

    ok(res, { url: session.url });

  } catch (error) {
    // ✅ এরর হ্যান্ডলিং: সার্ভার ক্র্যাশ হবে না, শুধু এরর মেসেজ দেখাবে
    console.error("🔥 Stripe Checkout Error:", error.message);
    res.status(error.statusCode || 500).json({
      success: false,
      error: error.message
    });
  }
});

// ২. Webhook (পেমেন্ট সফল হলে ডাটাবেস আপডেট)
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, userEmail, userRole, planName } = session.metadata;

    // Idempotency: skip if this session was already processed
    const existingPayment = await Payment.findOne({ stripeSessionId: session.id });
    if (existingPayment) {
      return res.json({ received: true });
    }

    await User.findByIdAndUpdate(userId, { plan: "pro" });

    await Payment.create({
      userEmail,
      userName: session.customer_details?.name || "Unknown",
      userRole,
      planName,
      amount: session.amount_total / 100, // Stripe পয়সায় পাঠায়, তাই ১০০ দিয়ে ভাগ
      currency: session.currency,
      transactionId: session.payment_intent?.toString() || session.id,
      stripeSessionId: session.id,
      paymentStatus: "paid",
      paidAt: new Date(),
    });
  }

  res.json({ received: true });
});

// ৩. Fetch a checkout session by ID (authenticated user only)
router.get("/session/:sessionId", verifyToken, async (req, res) => {
  const { sessionId } = req.params;

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (err.statusCode === 404) {
      throw new ApiError(404, "Checkout session not found");
    }
    throw new ApiError(502, "Could not reach Stripe");
  }

  // Verify ownership: the session must belong to the signed-in user
  if (session.metadata?.userId !== req.dbUser._id.toString()) {
    throw new ApiError(403, "This checkout session belongs to another user");
  }

  ok(res, {
    stripeSessionId: session.id,
    status: session.status,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    currency: session.currency,
    customer_email: session.customer_details?.email || session.metadata?.userEmail,
    plan: session.metadata?.planName || null,
    role: session.metadata?.userRole || null,
    payment_intent: session.payment_intent?.toString() || null,
  });
});

export default router;