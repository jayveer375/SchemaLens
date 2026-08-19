"use client";

import { Sparkles, ArrowUpRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { aiGenerationsLeft, canUsePlayground } from "@/lib/subscription";
import { cn } from "@/lib/utils";

interface AICreditsWidgetProps {
  className?: string;
  variant?: "card" | "pill" | "banner";
  onNavigate?: (page: string) => void;
}

export default function AICreditsWidget({
  className,
  variant = "card",
  onNavigate,
}: AICreditsWidgetProps) {
  const { getSubscription } = useStore();
  const subscription = getSubscription();
  const isPro = canUsePlayground(subscription);
  const isUltimate = subscription.planId === "ultimate";
  const aiCreditsLeft = aiGenerationsLeft(subscription);
  const maxCredits = isPro ? 150 : 50;
  const percentage = isUltimate ? 100 : Math.min(100, Math.max(0, (aiCreditsLeft / maxCredits) * 100));

  const isLow = !isUltimate && aiCreditsLeft <= 15 && aiCreditsLeft > 0;
  const isExhausted = !isUltimate && aiCreditsLeft === 0;

  if (variant === "pill") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold shadow-xs transition-all",
          isExhausted
            ? "bg-red-500/10 border-red-500/25 text-red-600 dark:text-red-400"
            : isLow
            ? "bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400"
            : "bg-[var(--card)] border-[var(--border)] text-[var(--text)]",
          className
        )}
      >
        <Sparkles size={14} className={isExhausted ? "text-red-500" : isLow ? "text-amber-500" : "text-[var(--primary)]"} />
        <span>
          {isUltimate ? (
            <strong className="text-purple-500">Unlimited AI Credits</strong>
          ) : (
            <>
              <strong>{aiCreditsLeft}</strong> / {maxCredits} AI Credits
            </>
          )}
        </span>
        {isUltimate ? (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white">
            ULTIMATE
          </span>
        ) : isPro ? (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-500 dark:text-indigo-400">
            PRO
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-3.5 rounded-xl bg-[var(--card)] border border-[var(--border)] shadow-xs flex flex-col gap-2",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={15} className="text-[var(--primary)] shrink-0" />
          <span className="text-xs font-bold text-[var(--text)]">AI Credits</span>
        </div>

        <div className="flex items-center gap-1.5">
          {isUltimate ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-gradient-to-r from-purple-500 to-pink-500 text-white">
              ULTIMATE
            </span>
          ) : isPro ? (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              PRO
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/15 text-gray-600 dark:text-gray-400 border border-gray-500/20">
              FREE
            </span>
          )}

          {onNavigate && !isUltimate && (
            <button
              onClick={() => onNavigate("pricing")}
              className="text-[10px] text-[var(--primary)] font-semibold hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
            >
              Get More <ArrowUpRight size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        {isUltimate ? (
          <span className="font-bold text-purple-600 dark:text-purple-400">Unlimited generations</span>
        ) : (
          <div className="flex items-baseline gap-1">
            <span className="text-sm font-extrabold text-[var(--text)]">{aiCreditsLeft}</span>
            <span className="text-[11px] text-[var(--text-subtle)]">/ {maxCredits} credits left</span>
          </div>
        )}

        {isLow && <span className="text-[10px] font-bold text-amber-500">Low credits</span>}
        {isExhausted && <span className="text-[10px] font-bold text-red-500">Exhausted</span>}
      </div>

      {isUltimate ? (
        <div className="h-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
      ) : (
        <div className="h-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-300 rounded-full",
              isExhausted
                ? "bg-red-500"
                : isLow
                ? "bg-amber-500"
                : "bg-gradient-to-r from-primary-500 to-primary-600"
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  );
}
