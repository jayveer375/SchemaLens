"use client";
import { motion } from "framer-motion";
import { Lock, Check, Zap, ArrowLeft } from "lucide-react";

interface Feature {
  icon: string;
  text: string;
}

interface LockedFeatureScreenProps {
  /** Feature name shown as the heading */
  title: string;
  /** Short description under the heading */
  description: string;
  /** Bullet list of features the user is missing */
  features: Feature[];
  /** Which plan unlocks this — used for the badge label */
  requiredPlan?: "pro" | "ultimate";
  /** Optional prop-based back handler (used when the component receives onNavigateBack) */
  onNavigateBack?: () => void;
  /** Optional prop-based upgrade handler (used when the component receives onNavigate) */
  onUpgrade?: () => void;
  /** Price string shown on the upgrade button, e.g. "₹199 / month" */
  upgradePrice?: string;
}

/**
 * Dispatches a custom "navigateBack" DOM event so the SPA root (app/page.tsx)
 * can pop prevPage — works even from components that receive no props
 * (e.g. PlaygroundPage).
 */
function dispatchBack() {
  window.dispatchEvent(new CustomEvent("navigateBack"));
}

export default function LockedFeatureScreen({
  title,
  description,
  features,
  requiredPlan = "pro",
  onNavigateBack,
  onUpgrade,
  upgradePrice = "₹199 / month",
}: LockedFeatureScreenProps) {
  const handleBack = () => {
    // Prefer prop-based handler; fall back to custom event (for prop-less pages)
    if (onNavigateBack) {
      onNavigateBack();
    } else {
      dispatchBack();
    }
  };

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.dispatchEvent(new CustomEvent("navigate", { detail: "pricing" }));
    }
  };

  const planLabel = requiredPlan === "ultimate" ? "Ultimate" : "Pro";
  const planColor =
    requiredPlan === "ultimate"
      ? "from-purple-500 to-pink-500"
      : "from-yellow-400 to-orange-400";

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] w-full px-4">
      {/* ── Back button ── */}
      <div className="w-full max-w-md mb-5">
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go back
        </button>
      </div>

      {/* ── Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full bg-white dark:bg-gray-900 border border-yellow-400/40 rounded-2xl p-8 text-center shadow-xl"
      >
        {/* Icon */}
        <div className="w-16 h-16 bg-gradient-to-br from-yellow-400/20 to-orange-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-yellow-500" />
        </div>

        {/* Plan badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold mb-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800">
          <Zap className="w-3 h-3" />
          {planLabel} Feature
        </div>

        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">{title}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-5 text-sm leading-relaxed">
          {description}
        </p>

        {/* Feature list */}
        <div className="grid grid-cols-2 gap-2 mb-6 text-xs text-left">
          {features.map((f) => (
            <div
              key={f.text}
              className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400"
            >
              {f.icon ? (
                <span className="text-sm leading-none flex-shrink-0">{f.icon}</span>
              ) : (
                <Check className="w-3 h-3 text-green-500 shrink-0" />
              )}
              {f.text}
            </div>
          ))}
        </div>

        {/* Upgrade CTA */}
        <button
          onClick={handleUpgrade}
          className={`w-full py-3 bg-gradient-to-r ${planColor} text-white rounded-xl font-bold hover:opacity-90 active:scale-[0.98] transition shadow-md text-sm`}
        >
          Upgrade to {planLabel} — {upgradePrice}
        </button>

        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
          Instant access after upgrade · Cancel anytime
        </p>
      </motion.div>
    </div>
  );
}
