// ── Plan definitions ──────────────────────────────────────────────────────────
import type { Plan, PlanId, Subscription } from "./types";

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    conversionsPerMonth: 5,
    maxProjects: 3,
    maxImagesPerProject: 5,
    aiGenerationsPerMonth: 50, // 50 AI credits for free users
    zipExport: false,
    priorityQueue: false,
    versionHistory: false,
    advancedExport: false,
    support: "community",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 199,
    conversionsPerMonth: 50,
    maxProjects: 25,
    maxImagesPerProject: 25,
    aiGenerationsPerMonth: 150, // 150 AI credits for pro users
    zipExport: true,
    priorityQueue: true,
    versionHistory: true,
    advancedExport: true,
    support: "priority",
  },
  ultimate: {
    id: "ultimate",
    name: "Ultimate",
    price: 699,
    conversionsPerMonth: 999999, // Unlimited conversions
    maxProjects: 999999,        // Unlimited projects
    maxImagesPerProject: 999999, // Unlimited images
    aiGenerationsPerMonth: 999999, // Unlimited AI credits
    zipExport: true,
    priorityQueue: true,
    versionHistory: true,
    advancedExport: true,
    support: "priority",
  },
};

// ── Get current month key ─────────────────────────────────────────────────────
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Build default subscription ────────────────────────────────────────────────
export function defaultSubscription(): Subscription {
  const now = Date.now();
  return {
    planId: "free",
    startedAt: now,
    renewsAt: now + 30 * 24 * 60 * 60 * 1000,
    conversionsUsedThisMonth: 0,
    aiGenerationsUsedThisMonth: 0,
    lastResetMonth: currentMonthKey(),
  };
}

// ── Reset monthly counter if month changed ────────────────────────────────────
export function maybeResetMonthly(sub: Subscription): Subscription {
  const now = currentMonthKey();
  if (sub.lastResetMonth !== now) {
    return { ...sub, conversionsUsedThisMonth: 0, aiGenerationsUsedThisMonth: 0, lastResetMonth: now };
  }
  return sub;
}

// ── Usage check helpers ───────────────────────────────────────────────────────
export function canConvert(sub: Subscription): boolean {
  if (sub.planId === "ultimate") return true;
  const s = maybeResetMonthly(sub);
  const plan = PLANS[s.planId];
  return s.conversionsUsedThisMonth < (s.conversionLimitOverride ?? plan.conversionsPerMonth);
}

export function canCreateProject(sub: Subscription, currentCount: number): boolean {
  if (sub.planId === "ultimate") return true;
  const plan = PLANS[sub.planId];
  return currentCount < (sub.projectLimitOverride ?? plan.maxProjects);
}

export function canAddImage(sub: Subscription, currentCount: number): boolean {
  if (sub.planId === "ultimate") return true;
  const plan = PLANS[sub.planId];
  return currentCount < (sub.imageLimitOverride ?? plan.maxImagesPerProject);
}

export function conversionsLeft(sub: Subscription): number {
  if (sub.planId === "ultimate") return 999999;
  const s = maybeResetMonthly(sub);
  const plan = PLANS[s.planId];
  return Math.max(0, (s.conversionLimitOverride ?? plan.conversionsPerMonth) - s.conversionsUsedThisMonth);
}

export function effectiveLimits(sub: Subscription) {
  const plan = PLANS[sub.planId];
  return {
    conversions: sub.conversionLimitOverride ?? plan.conversionsPerMonth,
    projects: sub.projectLimitOverride ?? plan.maxProjects,
    images: sub.imageLimitOverride ?? plan.maxImagesPerProject,
  };
}

export function getPlan(sub: Subscription): Plan {
  return PLANS[sub.planId] ?? PLANS.free;
}

export function canUsePlayground(sub: Subscription): boolean {
  return sub.planId === "pro" || sub.planId === "ultimate";
}

// ── AI Generation credits helpers ───────────────────────────────────────────────

/** Determines credit cost: 5 credits for small questions, 7 credits for big questions */
export function getQuestionCreditCost(input: string, mode?: string): number {
  const trimmed = (input || "").trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const isBig = mode === "analyze" || mode === "generate" || trimmed.length > 100 || wordCount > 20;
  return isBig ? 7 : 5;
}

export function canGenerateAI(sub: Subscription, requiredAmount: number = 5): boolean {
  if (sub.planId === "ultimate") return true;
  const left = aiGenerationsLeft(sub);
  return left >= requiredAmount;
}

export function aiGenerationsLeft(sub: Subscription): number {
  if (sub.planId === "ultimate") return 999999;
  const s = maybeResetMonthly(sub);
  const plan = PLANS[s.planId];
  const total = s.aiGenerationsLimitOverride ?? plan.aiGenerationsPerMonth;
  return Math.max(0, total - s.aiGenerationsUsedThisMonth);
}

export function incrementAIGenerations(sub: Subscription, amount: number = 1): Subscription {
  const s = maybeResetMonthly(sub);
  return { ...s, aiGenerationsUsedThisMonth: s.aiGenerationsUsedThisMonth + amount };
}
