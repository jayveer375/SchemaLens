"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, Zap, Crown, X, ChevronDown, ChevronUp,
  CreditCard, Clock, Shield, Star, ArrowRight, Sparkles, Infinity as InfinityIcon
} from "lucide-react";
import { useStore } from "@/lib/store";
import { PLANS } from "@/lib/subscription";
import type { PlanId } from "@/lib/types";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

// ── Razorpay checkout helper ──────────────────────────────────────────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const FEATURE_ROWS = [
  { label: "Conversions / month",       free: "5",          pro: "50",           ultimate: "Unlimited" },
  { label: "Max projects",              free: "3",          pro: "25",           ultimate: "Unlimited" },
  { label: "Images per project",        free: "5",          pro: "25",           ultimate: "Unlimited" },
  { label: "AI Assistant Credits",      free: "50",         pro: "150",          ultimate: "Unlimited" },
  { label: "Quick Convert",             free: true,         pro: true,           ultimate: true },
  { label: "Monaco code editor",        free: true,         pro: true,           ultimate: true },
  { label: "SQL / TXT / JSON export",   free: true,         pro: true,           ultimate: true },
  { label: "SQL Playground",            free: false,        pro: true,           ultimate: true },
  { label: "History & audit log",       free: false,        pro: true,           ultimate: true },
  { label: "ZIP project export",        free: false,        pro: true,           ultimate: true },
  { label: "Version history",           free: false,        pro: true,           ultimate: true },
  { label: "Priority queue",            free: false,        pro: true,           ultimate: true },
  { label: "Advanced export options",   free: false,        pro: true,           ultimate: true },
  { label: "Support",                   free: "Community",  pro: "Priority",     ultimate: "VIP 24/7" },
];

const FAQ = [
  { q: "Can I cancel my subscription anytime?", a: "Yes. You can cancel at any time from your account settings. Your plan will remain active until the end of the billing period." },
  { q: "What is included in the Ultimate plan?", a: "The Ultimate plan gives you unlimited image conversions, unlimited projects, unlimited images per project, and unlimited AI assistant credits with no restrictions." },
  { q: "What counts as a conversion?", a: "Each ER diagram image you analyze (via Quick Convert or inside a Project) counts as one conversion." },
  { q: "Do unused conversions roll over?", a: "No. The conversion count resets at the start of each calendar month." },
  { q: "What payment methods are accepted?", a: "We support Razorpay (UPI, debit/credit cards, net banking) and Stripe." },
  { q: "Is my data safe?", a: "Yes. Your ER diagrams are processed securely and are never stored on our servers. Generated code is saved locally in your browser." },
];

export default function PricingPage() {
  const { subscription, upgradeToPlan, user } = useStore();
  const currentPlan = subscription.planId;
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);

  const handleUpgrade = async (targetPlan: "pro" | "ultimate") => {
    setLoadingPlan(targetPlan);
    const planInfo = PLANS[targetPlan];

    try {
      // 1. Load Razorpay checkout SDK
      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded) {
        toast.error("Failed to load payment gateway. Please try again.");
        setLoadingPlan(null);
        return;
      }

      // 2. Create an order on server
      const orderRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: planInfo.price }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        throw new Error(err?.error ?? "Could not create payment order.");
      }

      const { orderId, amount, currency, keyId } = await orderRes.json();

      // 3. Open Razorpay checkout popup
      await new Promise<void>((resolve, reject) => {
        const options = {
          key:          keyId,
          amount,                          // in paise
          currency,
          name:         "Schemalens",
          description:  `${planInfo.name} Plan — Monthly`,
          order_id:     orderId,
          prefill: {
            name:  user?.name  ?? "",
            email: user?.email ?? "",
          },
          theme: { color: targetPlan === "ultimate" ? "#8b5cf6" : "#6366f1" },

          handler: async (response: {
            razorpay_order_id:   string;
            razorpay_payment_id: string;
            razorpay_signature:  string;
          }) => {
            try {
              // 4. Verify signature on server
              const numericUserId = parseInt(user?.id ?? "", 10);
              const verifyRes = await fetch("/api/razorpay/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_order_id:   response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature:  response.razorpay_signature,
                  plan_purchased:      targetPlan,
                  amount:              planInfo.price,
                  user_id: isNaN(numericUserId) ? undefined : numericUserId,
                }),
              });

              const result = await verifyRes.json();

              if (verifyRes.ok && result.status === "success") {
                upgradeToPlan(targetPlan);
                toast.success(`🎉 Upgraded to ${planInfo.name}! Enjoy ${targetPlan === "ultimate" ? "unlimited access" : "enhanced features"}.`);
                resolve();
              } else {
                reject(new Error(result?.message ?? "Payment verification failed."));
              }
            } catch (err: any) {
              reject(err);
            }
          },

          modal: {
            ondismiss: () => reject(new Error("Payment cancelled.")),
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", (resp: any) => {
          reject(new Error(resp?.error?.description ?? "Payment failed."));
        });
        rzp.open();
      });
    } catch (err: any) {
      if (err?.message !== "Payment cancelled.") {
        toast.error(err?.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleDowngrade = () => {
    toast("Contact support to change or manage your plan.", { icon: "ℹ️" });
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full
          bg-primary-50 dark:bg-primary-900/30 border border-primary-100 dark:border-primary-800/50 mb-4">
          <Crown size={13} className="text-primary-600" />
          <span className="text-xs font-semibold text-primary-600">Simple, Transparent Pricing</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text)] mb-3">
          Choose your plan
        </h1>
        <p className="text-[var(--text-muted)] max-w-lg mx-auto text-sm sm:text-base">
          Start free and upgrade when you need more power.
          No hidden fees, no credit card required for the free plan.
        </p>
      </div>

      {/* Current plan badge */}
      {currentPlan !== "free" && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 mb-6"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10
            border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
            <Check size={14} />
            You are currently on the <span className="capitalize font-bold">{currentPlan}</span> plan
          </div>
        </motion.div>
      )}

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Free Plan */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={cn(
            "card p-7 flex flex-col",
            currentPlan === "free" && "ring-2 ring-primary-500/20"
          )}
        >
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-1">Free</p>
              <div className="flex items-end gap-1.5">
                <span className="text-4xl font-bold text-[var(--text)]">₹0</span>
                <span className="text-sm text-[var(--text-muted)] mb-1">/ month</span>
              </div>
            </div>
            {currentPlan === "free" && (
              <span className="badge badge-purple text-[10px]">Current Plan</span>
            )}
          </div>

          <p className="text-sm text-[var(--text-muted)] mb-5">
            Perfect for exploring ER diagram conversion.
          </p>

          <ul className="space-y-2.5 mb-6 flex-1">
            {[
              "5 conversions / month",
              "3 projects",
              "5 images per project",
              "50 AI credits / month",
              "Quick Convert",
              "SQL · TXT · JSON export",
              "Community support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
                <Check size={13} className="text-emerald-500 flex-shrink-0" />
                {f}
              </li>
            ))}
            {["SQL Playground", "History & audit log", "ZIP export", "Version history", "Priority queue"].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-[var(--text-subtle)] opacity-50">
                <X size={12} className="text-[var(--border)] flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          <button disabled className="btn-ghost w-full justify-center py-3 text-sm opacity-50 cursor-default">
            {currentPlan === "free" ? "Current Plan" : currentPlan === "ultimate" ? "Included in Ultimate" : "Basic Access"}
          </button>
        </motion.div>

        {/* Pro Plan */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className={cn(
            "card p-7 flex flex-col relative overflow-hidden",
            currentPlan === "pro" && "ring-2 ring-primary-500/30"
          )}
        >
          <div className="absolute top-0 left-0 right-0 h-1"
            style={{ background: "linear-gradient(to right, #6366f1, #8b5cf6)" }} />

          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-500">Pro</p>
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                  <Star size={9} fill="currentColor" /> Popular
                </span>
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-4xl font-bold text-[var(--text)]">₹199</span>
                <span className="text-sm text-[var(--text-muted)] mb-1">/ month</span>
              </div>
            </div>
            {currentPlan === "pro" && (
              <span className="badge bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 text-[10px]">Active</span>
            )}
          </div>

          <p className="text-sm text-[var(--text-muted)] mb-5">
            For professionals needing enhanced capacity.
          </p>

          <ul className="space-y-2.5 mb-6 flex-1">
            {[
              "50 conversions / month",
              "25 projects",
              "25 images per project",
              "150 AI credits / month",
              "Quick Convert & SQL Playground",
              "SQL · TXT · JSON export",
              "History & audit log",
              "ZIP project export",
              "Version history & Priority queue",
              "Priority support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
                <Check size={13} className="text-emerald-500 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {currentPlan === "pro" ? (
            <div className="space-y-2">
              <div className="text-center text-sm text-emerald-600 font-medium py-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                ✓ Active Plan
              </div>
              <button onClick={handleDowngrade} className="btn-ghost w-full justify-center text-xs py-2 text-[var(--text-subtle)]">
                Manage Subscription
              </button>
            </div>
          ) : currentPlan === "ultimate" ? (
            <div className="text-center text-sm text-[var(--text-muted)] font-medium py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] opacity-75">
              Included in Ultimate
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => handleUpgrade("pro")}
              disabled={loadingPlan !== null}
              className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-60
                bg-indigo-600 hover:bg-indigo-700"
            >
              {loadingPlan === "pro" ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing…
                </span>
              ) : (
                <>
                  <Zap size={14} className="text-yellow-300" />
                  Get Pro
                  <ArrowRight size={14} />
                </>
              )}
            </motion.button>
          )}
        </motion.div>

        {/* Ultimate Plan (₹699) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className={cn(
            "card p-7 flex flex-col relative overflow-hidden bg-gradient-to-b from-[var(--card)] to-purple-500/5",
            currentPlan === "ultimate" && "ring-2 ring-purple-500/50"
          )}
        >
          {/* Accent border */}
          <div className="absolute top-0 left-0 right-0 h-1.5"
            style={{ background: "linear-gradient(to right, #8b5cf6, #ec4899, #f59e0b)" }} />

          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">Ultimate</p>
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
                  bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30">
                  <Crown size={10} className="text-amber-500" /> Unlimited Everything
                </span>
              </div>
              <div className="flex items-end gap-1.5">
                <span className="text-4xl font-bold text-[var(--text)]">₹699</span>
                <span className="text-sm text-[var(--text-muted)] mb-1">/ month</span>
              </div>
            </div>
            {currentPlan === "ultimate" && (
              <span className="badge bg-purple-500/20 text-purple-400 text-[10px] font-bold">Active</span>
            )}
          </div>

          <p className="text-sm text-[var(--text-muted)] mb-5">
            For power users & teams requiring complete freedom with zero limits.
          </p>

          <ul className="space-y-2.5 mb-6 flex-1">
            {[
              "Unlimited conversions / month",
              "Unlimited projects",
              "Unlimited images per project",
              "Unlimited AI assistant credits",
              "No question credit deductions",
              "Full SQL Playground access",
              "History & audit logs",
              "ZIP & advanced exports",
              "Highest priority queue",
              "VIP 24/7 priority support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
                <Check size={13} className="text-emerald-500 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          {currentPlan === "ultimate" ? (
            <div className="space-y-2">
              <div className="text-center text-sm text-purple-600 dark:text-purple-400 font-bold py-3 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20">
                ✓ Ultimate Plan Active
              </div>
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
              onClick={() => handleUpgrade("ultimate")}
              disabled={loadingPlan !== null}
              className="btn-primary w-full justify-center py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/25
                bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 hover:opacity-95"
            >
              {loadingPlan === "ultimate" ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing…
                </span>
              ) : (
                <>
                  <Crown size={15} className="text-yellow-300" />
                  Get Ultimate (₹699)
                  <ArrowRight size={14} />
                </>
              )}
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* Feature comparison table */}
      <div className="card overflow-hidden mb-12">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="font-bold text-[var(--text)]">Full Feature Comparison</h2>
          <span className="text-xs text-[var(--text-subtle)]">Compare all plan capabilities</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="text-left px-6 py-3.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide w-2/5">Feature</th>
                <th className="text-center px-4 py-3.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Free (₹0)</th>
                <th className="text-center px-4 py-3.5 text-xs font-semibold text-indigo-500 uppercase tracking-wide">Pro (₹199)</th>
                <th className="text-center px-4 py-3.5 text-xs font-bold text-purple-500 uppercase tracking-wide">Ultimate (₹699)</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map(({ label, free, pro, ultimate }, i) => (
                <tr key={label} className={cn(
                  "border-b border-[var(--border)] last:border-none hover:bg-[var(--card)]/80 transition-colors",
                  i % 2 === 0 ? "" : "bg-[var(--surface)]/50"
                )}>
                  <td className="px-6 py-3.5 text-sm font-medium text-[var(--text)]">{label}</td>
                  <td className="px-4 py-3.5 text-center">
                    {typeof free === "boolean" ? (
                      free ? <Check size={15} className="text-emerald-500 mx-auto" /> : <X size={14} className="text-[var(--border)] mx-auto" />
                    ) : (
                      <span className="text-sm text-[var(--text-muted)]">{free}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {typeof pro === "boolean" ? (
                      pro ? <Check size={15} className="text-emerald-500 mx-auto" /> : <X size={14} className="text-[var(--border)] mx-auto" />
                    ) : (
                      <span className="text-sm font-semibold text-[var(--text)]">{pro}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-center bg-purple-500/5">
                    {typeof ultimate === "boolean" ? (
                      ultimate ? <Check size={16} className="text-purple-500 font-bold mx-auto" /> : <X size={14} className="text-[var(--border)] mx-auto" />
                    ) : (
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{ultimate}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trust badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
        {[
          { icon: Shield, title: "Secure Payments", desc: "Powered by Razorpay" },
          { icon: Clock,  title: "Cancel Anytime",  desc: "No long-term commitments" },
          { icon: CreditCard, title: "Instant Activation", desc: "Access immediately upon payment" },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-primary-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
              <p className="text-xs text-[var(--text-muted)]">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* FAQ */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-[var(--text)] mb-5 text-center">Frequently Asked Questions</h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <div key={i} className="card overflow-hidden">
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--surface)] transition-colors"
              >
                <span className="text-sm font-semibold text-[var(--text)] pr-4">{item.q}</span>
                {faqOpen === i ? (
                  <ChevronUp size={16} className="text-[var(--text-muted)] flex-shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-[var(--text-muted)] flex-shrink-0" />
                )}
              </button>
              <AnimatePresence>
                {faqOpen === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-4 text-sm text-[var(--text-muted)] leading-relaxed border-t border-[var(--border)]
                      pt-3">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
