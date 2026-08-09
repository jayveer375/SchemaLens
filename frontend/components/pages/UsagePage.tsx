"use client";
import { motion } from "framer-motion";
import {
  BarChart3, Database, FolderOpen, Sparkles,
  FileCode, Zap, Star, ArrowRight,
  Clock, TrendingUp, CheckCircle2, AlertTriangle,
  Activity, Layers, RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import { conversionsLeft, getPlan, effectiveLimits } from "@/lib/subscription";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.38, ease: [0.16, 1, 0.3, 1] },
});

// ── Radial progress ring ──────────────────────────────────────────────────────
function Ring({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const r = (size - 10) / 2;  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--border)" strokeWidth={7} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }}
        animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
      />
    </svg>
  );
}

// ── Usage meter row ───────────────────────────────────────────────────────────
function Meter({ label, used, total, color, icon: Icon, desc }: {
  label: string; used: number; total: number;
  color: string; icon: LucideIcon; desc?: string;
}) {
  const pct = Math.min(100, Math.round((used / Math.max(total, 1)) * 100));
  const isHigh = pct >= 80;
  const isFull = pct >= 100;
  const ringColor = isFull ? "#ef4444" : isHigh ? "#f59e0b" : color;
  return (
    <div className="flex items-center gap-4 py-4 border-b border-[var(--border)] last:border-none">
      {/* Ring + centered icon */}
      <div className="flex-shrink-0 relative w-[72px] h-[72px]">
        <Ring pct={pct} color={ringColor} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={18} style={{ color: ringColor }} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Icon size={15} className="text-[var(--text-muted)]" />
          <span className="text-base font-bold text-[var(--text)]">{label}</span>
          {isFull && <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400">FULL</span>}
          {isHigh && !isFull && <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">HIGH</span>}
        </div>
        {desc && <p className="text-sm text-[var(--text-subtle)] mb-1.5">{desc}</p>}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-[var(--surface)] overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(3, pct)}%` }}
              transition={{ duration: 0.9, ease: "easeOut", delay: 0.25 }}
              className="h-full rounded-full"
              style={{ background: isFull ? "#ef4444" : isHigh ? "#f59e0b" : color }}
            />
          </div>
          <span className={cn("text-sm font-bold tabular-nums flex-shrink-0", isFull ? "text-red-500" : isHigh ? "text-amber-500" : "text-[var(--text-muted)]")}>
            {used} / {total}
          </span>
          <span className="text-sm text-[var(--text-subtle)] flex-shrink-0">({pct}%)</span>
        </div>
      </div>
    </div>
  );
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({ label, value, icon: Icon, color, bg, sub: subtitle }: {
  label: string; value: number | string;
  icon: LucideIcon; color: string; bg: string; sub?: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-2 min-w-0">
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", bg)}>
        <Icon size={18} className={color} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-[var(--text)] tabular-nums leading-tight">{value}</div>
        <div className="text-sm font-medium text-[var(--text-muted)] mt-0.5 leading-snug break-words">{label}</div>
        {subtitle && <div className="text-xs text-[var(--text-subtle)] mt-0.5 leading-snug">{subtitle}</div>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UsagePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user, projects: allProjects, getSubscription, quickHistory } = useStore();

  const sub      = getSubscription();
  const plan     = getPlan(sub);
  const isPro    = sub.planId === "pro";
  const ownerId  = user?.id ?? "";
  const limits   = effectiveLimits(sub);

  const myProjects    = allProjects.filter((p) => p.ownerId === ownerId);
  const totalFiles    = myProjects.reduce((s, p) => s + p.files.length, 0);
  const totalDone     = myProjects.reduce((s, p) => s + p.files.filter((f) => f.status === "completed").length, 0);
  const totalFailed   = myProjects.reduce((s, p) => s + p.files.filter((f) => f.status === "failed").length, 0);
  const left          = conversionsLeft(sub);

  const renewsAt = sub.renewsAt
    ? new Date(sub.renewsAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—";

  const successRate = totalFiles > 0 ? Math.round((totalDone / totalFiles) * 100) : 0;

  // Per-project stats
  const projectStats = myProjects
    .map((p) => ({
      id: p.id,
      name: p.name,
      dbType: p.dbType,
      total: p.files.length,
      done: p.files.filter((f) => f.status === "completed").length,
      failed: p.files.filter((f) => f.status === "failed").length,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="w-full space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0)} className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Activity size={22} style={{ color: "var(--primary)" }} />
            <h1 className="text-3xl font-bold text-[var(--text)]">Usage & Limits</h1>
          </div>
          <p className="text-base text-[var(--text-muted)]">
            A full breakdown of your plan usage, quotas, and activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
        </div>
      </motion.div>

      {/* ── Plan banner ─────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.05)}
        className={cn(
          "rounded-2xl border p-5 flex items-center gap-5 flex-wrap",
          isPro
            ? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-500/10 dark:to-yellow-500/5 border-amber-200 dark:border-amber-500/20"
            : "bg-[var(--card)] border-[var(--border)]"
        )}
      >
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0",
          isPro ? "bg-amber-100 dark:bg-amber-500/20" : "bg-[var(--surface)]"
        )}>
          {isPro
            ? <Star size={22} className="fill-amber-500 text-amber-500" />
            : <Layers size={22} className="text-[var(--text-muted)]" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-base font-bold text-[var(--text)]">{plan.name} Plan</span>
            {isPro && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">ACTIVE</span>}
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            {isPro
              ? `Priority processing · ZIP exports · Version history · Renews ${renewsAt}`
              : `Community support · ${plan.conversionsPerMonth} conversions/month · ${plan.maxProjects} projects`}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-xl font-bold text-[var(--text)]">
            {isPro ? `₹${plan.price}` : "Free"}
          </div>
          <div className="text-sm text-[var(--text-muted)]">{isPro ? "per month" : "forever"}</div>
        </div>
      </motion.div>

      {/* ── Summary stats ───────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.08)}>
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-3 px-1">Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatTile label="Projects"        value={myProjects.length}           icon={FolderOpen}  color="text-[var(--primary)]"  bg="bg-[var(--primary-light)]"            sub={`of ${limits.projects} max`} />
          <StatTile label="AI Conversions"  value={sub.conversionsUsedThisMonth} icon={BarChart3}   color="text-violet-600"         bg="bg-violet-50 dark:bg-violet-500/10"  sub={`${left} remaining`} />
          <StatTile label="Quick Converts"  value={quickHistory.length}          icon={Sparkles}    color="text-sky-600"            bg="bg-sky-50 dark:bg-sky-500/10" />
          <StatTile label="Files Converted" value={totalDone}                    icon={CheckCircle2} color="text-emerald-600"        bg="bg-emerald-50 dark:bg-emerald-500/10" />
          <StatTile label="Files Failed"    value={totalFailed}                  icon={AlertTriangle} color="text-red-500"           bg="bg-red-50 dark:bg-red-500/10" />
          <StatTile label="Success Rate"    value={`${successRate}%`}            icon={TrendingUp}  color="text-amber-600"          bg="bg-amber-50 dark:bg-amber-500/10" />
        </div>
      </motion.div>

      {/* ── Quota meters ────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.12)}>
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-3 px-1">Plan Quotas</h2>
        <div className="card p-5">
          <Meter
            label="AI Conversions this month"
            used={sub.conversionsUsedThisMonth}
            total={limits.conversions}
            color="var(--primary)"
            icon={BarChart3}
            desc={`Resets on the 1st of each month · ${left} remaining`}
          />
          <Meter
            label="Projects"
            used={myProjects.length}
            total={limits.projects}
            color="#10b981"
            icon={FolderOpen}
            desc="Total active project workspaces"
          />
          <Meter
            label="Files per Project"
            used={Math.max(...myProjects.map((p) => p.files.length), 0)}
            total={limits.images}
            color="#0ea5e9"
            icon={FileCode}
            desc="Largest project by file count"
          />
        </div>

        {!isPro && (
          <motion.div {...fadeUp(0.16)}
            className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center gap-3 flex-wrap">
            <Zap size={17} className="text-amber-500 flex-shrink-0" />
            <p className="flex-1 text-sm text-[var(--text-muted)]">
              On <span className="font-semibold text-[var(--text)]">Pro</span> you get{" "}
              <span className="font-semibold text-[var(--primary)]">50 conversions/month</span>,{" "}
              25 projects, 25 files/project, ZIP export, version history & priority support.
            </p>
            <button onClick={() => onNavigate("pricing")}
              className="flex items-center gap-1 text-sm font-bold text-[var(--primary)] hover:underline flex-shrink-0">
              View plans <ArrowRight size={13} />
            </button>
          </motion.div>
        )}
      </motion.div>

      {/* ── Monthly billing cycle ────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.15)}>
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-3 px-1">Billing Cycle</h2>
        <div className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
          {[
            { label: "Current period",   value: sub.lastResetMonth ?? "—",    icon: Clock },
            { label: "Renews / Resets",  value: renewsAt,                     icon: RefreshCw },
            { label: "Conversions used", value: `${sub.conversionsUsedThisMonth} of ${limits.conversions}`, icon: Activity },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3 py-2 sm:py-0 sm:px-4 first:pl-0 last:pr-0">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--surface)]">
                <Icon size={16} className="text-[var(--text-muted)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--text-subtle)]">{label}</p>
                <p className="text-base font-bold text-[var(--text)]">{value}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Feature access table ────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0.18)}>
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-3 px-1">Feature Access</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-[var(--border)]" style={{ background: "var(--surface)" }}>
                <th className="text-left px-5 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">Feature</th>
                <th className="text-center px-4 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">Your Plan</th>
                <th className="text-center px-4 py-3.5 text-sm font-bold text-amber-500 uppercase tracking-wider hidden sm:table-cell">Pro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {[
                { feature: "AI Conversions / month",  yours: `${limits.conversions}`,             pro: "50"          },
                { feature: "Projects",                 yours: `${limits.projects}`,                pro: "25"          },
                { feature: "Files per project",        yours: `${limits.images}`,                  pro: "25"          },
                { feature: "ZIP export",               yours: plan.zipExport,                      pro: true          },
                { feature: "Priority queue",           yours: plan.priorityQueue,                  pro: true          },
                { feature: "Version history",          yours: plan.versionHistory,                 pro: true          },
                { feature: "Advanced export",          yours: plan.advancedExport,                 pro: true          },
                { feature: "Support",                  yours: plan.support,                        pro: "Priority"    },
              ].map(({ feature, yours, pro }) => {
                const yStr = typeof yours === "boolean" ? (yours ? "✓" : "✗") : String(yours);
                const pStr = typeof pro   === "boolean" ? (pro   ? "✓" : "✗") : String(pro);
                return (
                  <tr key={feature} className="hover:bg-[var(--surface)] transition-colors">
                    <td className="px-5 py-3.5 text-[var(--text)] font-medium">{feature}</td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={cn(
                        "text-base font-bold",
                        yStr === "✗" ? "text-red-400" : "text-[var(--text)]"
                      )}>{yStr}</span>
                    </td>
                    <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                      <span className="text-base font-bold text-amber-500">{pStr}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── Per-project breakdown ─────────────────────────────────────────────── */}
      {projectStats.length > 0 && (
        <motion.div {...fadeUp(0.22)}>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-3 px-1">Projects Breakdown</h2>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-base min-w-[480px]">
                <thead>
                  <tr className="border-b border-[var(--border)]" style={{ background: "var(--surface)" }}>
                    <th className="text-left px-5 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">Project</th>
                    <th className="text-center px-4 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">Files</th>
                    <th className="text-center px-4 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">Done</th>
                    <th className="text-center px-4 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider">Failed</th>
                    <th className="text-center px-4 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider hidden sm:table-cell">DB</th>
                    <th className="text-right px-5 py-3.5 text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider hidden md:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {projectStats.map((p) => {
                    return (
                      <tr key={p.id}
                        onClick={() => { useStore.getState().setActiveProject(p.id); onNavigate("project-detail"); }}
                        className="hover:bg-[var(--surface)] transition-colors cursor-pointer group"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                              style={{ background: "var(--primary-light)" }}>
                              <Database size={13} style={{ color: "var(--primary)" }} />
                            </div>
                            <span className="font-semibold text-[var(--text)] truncate max-w-[140px] group-hover:text-[var(--primary)] transition-colors">
                              {p.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center text-[var(--text-muted)] font-medium">{p.total}</td>
                        <td className="px-4 py-3.5 text-center">
                          <span className="text-emerald-600 font-bold">{p.done}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={cn("font-bold", p.failed > 0 ? "text-red-500" : "text-[var(--text-subtle)]")}>
                            {p.failed}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center hidden sm:table-cell">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]">
                            {p.dbType.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right text-sm text-[var(--text-subtle)] hidden md:table-cell">
                          {timeAgo(p.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Quick Convert history summary ─────────────────────────────────── */}
      {quickHistory.length > 0 && (
        <motion.div {...fadeUp(0.26)}>
          <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-3 px-1">Recent Quick Converts</h2>
          <div className="card overflow-hidden">
            <div className="divide-y divide-[var(--border)]">
              {quickHistory.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={15} className="text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text)] truncate">{r.filename}</p>
                    <p className="text-xs text-[var(--text-subtle)]">
                      {r.stats.tables} tables · {r.stats.relationships} relationships
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-[var(--text-subtle)]">{timeAgo(r.timestamp)}</p>
                    <p className="text-xs text-emerald-500 font-semibold">Done</p>
                  </div>
                </div>
              ))}
            </div>
            {quickHistory.length > 8 && (
              <div className="px-5 py-3.5 border-t border-[var(--border)]">
                <button onClick={() => onNavigate("history")}
                  className="text-sm text-[var(--primary)] font-semibold hover:underline flex items-center gap-1">
                  View all {quickHistory.length} entries <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
