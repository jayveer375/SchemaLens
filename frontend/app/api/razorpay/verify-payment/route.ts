import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── POST /api/razorpay/verify-payment ────────────────────────────────────────
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, user_id }
export async function POST(req: NextRequest) {
  if (!KEY_SECRET) {
    return NextResponse.json(
      { error: "Razorpay credentials not configured on the server." },
      { status: 503 }
    );
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, user_id, plan_purchased, amount } =
      await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required payment fields." },
        { status: 400 }
      );
    }

    // Compute expected HMAC-SHA256 signature
    const body      = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected  = crypto
      .createHmac("sha256", KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return NextResponse.json(
        { status: "failure", message: "Payment signature verification failed." },
        { status: 400 }
      );
    }

    // ── Signature is valid — record payment + upgrade plan in the database ──────
    if (user_id) {
      try {
        const plan = plan_purchased ?? "pro";
        const amtPaise = amount ? Number(amount) * 100 : (plan === "ultimate" ? 69900 : 19900);
        const res = await fetch(`${BACKEND_URL}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            amount_paise: amtPaise,
            plan_purchased: plan,
          }),
        });
        if (!res.ok) {
          console.error("[verify-payment] Failed to record payment in DB:", await res.text());
        }
      } catch (dbErr) {
        console.error("[verify-payment] DB payment record error:", dbErr);
        // Don't fail the whole request — payment is already captured by Razorpay
      }
    }

    return NextResponse.json({
      status:  "success",
      message: "Payment verified successfully.",
    });
  } catch (err: any) {
    console.error("[razorpay/verify-payment]", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to verify payment." },
      { status: 500 }
    );
  }
}
