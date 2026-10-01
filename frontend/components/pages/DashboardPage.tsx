"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Wand2, Terminal, Bot,
  FolderOpen, ArrowRight, Zap,
  Database, BarChart3, Download, CheckCircle2,
  AlertTriangle, TrendingUp, Sparkles, Star,
  ChevronRight, Clock, Activity, FileCode,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, timeAgo } from "@/lib/utils";
import { conversionsLeft, getPlan } from "@/lib/subscription";
import UpgradeLimitDialog from "@/components/UpgradeLimitDialog";
import type { LucideIcon } from "lucide-react";

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] },
});

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub: subtitle, icon: Icon,
  color, bg, trend, delay,
}: {
  label: string; value: number | string; sub?: string;
  icon: LucideIcon; color: string; bg: string;
  trend?: { value: string; up: boolean }; delay: number;
}) {
  return (
    <motion.div {...fadeUp(delay)} whileHover={{ y: -3, boxShadow: "0 8px 32px rgba(0,0,0,0.10)" }}
      className="card p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", bg)}>
          <Icon size={22} className={color} />
        </div>
        {trend && (
          <span className={cn(
            "text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-0.5",
            trend.up
              ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600"
              : "bg-red-50 dark:bg-red-500/10 text-red-500"
          )}>
            {trend.up ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
      <div>
        <div className="text-4xl font-bold text-[var(--text)] tabular-nums leading-none">{value}</div>
        <div className="text-sm font-semibold text-[var(--text-muted)] mt-2">{label}</div>
        {subtitle && <div className="text-xs text-[var(--text-subtle)] mt-0.5">{subtitle}</div>}
      </div>
    </motion.div>
  );
}

// ── Progress Row ──────────────────────────────────────────────────────────────
function ProgressRow({ label, used, total, color }: {
  label: string; used: number; total: number; color: string;
}) {
  const pct = Math.min(100, total > 0 ? Math.round((used / total) * 100) : 0);
  const isHigh = pct >= 80;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-[var(--text-muted)]">{label}</span>
        <span className={cn("font-bold tabular-nums", isHigh ? "text-red-500" : "text-[var(--text)]")}>
          {used} / {total}
          <span className="text-[var(--text-subtle)] font-normal ml-1">({pct}%)</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--surface)] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(3, pct)}%` }}
          transition={{ duration: 0.9, ease: "easeOut", delay: 0.3 }}
          className="h-full rounded-full"
          style={{ background: isHigh ? "#ef4444" : color }}
        />
      </div>
    </div>
  );
}

// ── Tool Card ─────────────────────────────────────────────────────────────────
function ToolCard({ icon: Icon, title, desc, badge, accentColor, btnColor, delay, onClick }: {
  icon: LucideIcon; title: string; desc: string; badge: string;
  accentColor: string; btnColor: string; delay: number; onClick: () => void;
}) {
  return (
    <motion.div {...fadeUp(delay)} whileHover={{ y: -3 }}
      onClick={onClick}
      className="card p-5 flex flex-col gap-3 cursor-pointer hover:shadow-lg transition-all duration-200 group"
    >
      <div className="flex items-start justify-between">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", accentColor)}>
          <Icon size={22} className="text-white" />
        </div>
        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] uppercase tracking-wider">
          {badge}
        </span>
      </div>
      <div className="flex-1">
        <h3 className="text-base font-bold text-[var(--text)]">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mt-1 leading-relaxed">{desc}</p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={cn("flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all", btnColor)}
      >
        Open <ArrowRight size={13} />
      </button>
    </motion.div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user, projects: allProjects, getSubscription, quickHistory } = useStore();

  const sub        = getSubscription();
  const plan       = getPlan(sub);
  const isPro      = sub.planId === "pro";
  const ownerId    = user?.id ?? "";
  const myProjects = allProjects.filter((p) => p.ownerId === ownerId);

  const totalFiles    = myProjects.reduce((s, p) => s + p.files.length, 0);
  const totalDone     = myProjects.reduce((s, p) => s + p.files.filter(f => f.status === "completed").length, 0);
  const totalFailed   = myProjects.reduce((s, p) => s + p.files.filter(f => f.status === "failed").length, 0);
  const totalPending  = myProjects.reduce((s, p) => s + p.files.filter(f => f.status === "waiting" || f.status === "processing").length, 0);
  const successRate   = totalFiles > 0 ? Math.round((totalDone / totalFiles) * 100) : 0;
  const left          = conversionsLeft(sub);
  const usagePct      = Math.min(100, Math.round((sub.conversionsUsedThisMonth / plan.conversionsPerMonth) * 100));

  // Recent activity from quickHistory
  const recentActivity = quickHistory.slice(0, 5);

  // Recent projects
  const recentProjects = [...myProjects].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);

  const [limitOpen, setLimitOpen] = useState(false);

  return (
    <div className="w-full space-y-6 pb-8">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <motion.div {...fadeUp(0)} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[var(--text)]">
            Welcome back, {user?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="mt-1 text-sm sm:text-base text-[var(--text-muted)]">
            Here's what's happening with your databases today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {!isPro && (
            <button onClick={() => onNavigate("pricing")}
              className="btn-primary text-sm hover:!bg-[var(--primary)] hover:!transform-none">
              <Zap size={14} /> Upgrade to Pro
            </button>
          )}
          <button onClick={() => onNavigate("projects")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:border-[var(--primary)]/50 transition-all">
            + New Project
          </button>
        </div>
      </motion.div>

      {/* ── KPI CARDS ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard delay={0.06} label="Total Projects"    value={myProjects.length}            sub={`${plan.maxProjects} max on ${plan.name}`}          icon={FolderOpen}    color="text-white" bg="bg-[var(--primary)]"                         />
        <KpiCard delay={0.09} label="SQL Generated"     value={totalDone}                    sub={totalFiles > 0 ? `${successRate}% success rate` : "No files yet"} icon={Database}   color="text-white" bg="bg-emerald-500"                        />
        <KpiCard delay={0.12} label="AI Requests Used"  value={sub.conversionsUsedThisMonth} sub={`${left} remaining this month`}                     icon={BarChart3}     color="text-white" bg="bg-violet-500"                                  />
        <KpiCard delay={0.15} label="Quick Converts"    value={quickHistory.length}          sub="One-off ER conversions"                             icon={Sparkles}      color="text-white" bg="bg-sky-500"                                     />
      </div>

      {/* ── MAIN GRID: Left (stats + tools) | Right (activity + projects) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Plan usage */}
          <motion.div {...fadeUp(0.20)} className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)]">Plan Usage</h2>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-bold px-2.5 py-0.5 rounded-full border",
                  isPro
                    ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-500/30"
                    : "bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)]"
                )}>
                  {isPro ? "⭐ Pro Plan" : "Free Plan"}
                </span>
                {!isPro && (
                  <button onClick={() => onNavigate("pricing")}
                    className="text-xs font-bold text-[var(--primary)] hover:underline">
                    Upgrade →
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <ProgressRow label="AI Conversions this month" used={sub.conversionsUsedThisMonth} total={plan.conversionsPerMonth} color="var(--primary)" />
              <ProgressRow label="Projects" used={myProjects.length} total={plan.maxProjects} color="#10b981" />
              <ProgressRow label="Files (largest project)" used={Math.max(...myProjects.map(p => p.files.length), 0)} total={plan.maxImagesPerProject} color="#0ea5e9" />
            </div>
          </motion.div>

          {/* Quick action tools */}
          <motion.div {...fadeUp(0.22)} className="card p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-4">
              Tools
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ToolCard delay={0.23} onClick={() => onNavigate("quick-convert")}
                icon={Upload}   title="Quick Convert"   desc="Upload an ER diagram image and get production-ready SQL instantly."
                badge="Image → SQL" accentColor="bg-teal-600 dark:bg-teal-700"  btnColor="bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600" />
              <ToolCard delay={0.26} onClick={() => onNavigate("generate")}
                icon={Wand2}    title="Generate Schema"  desc="Describe your database in plain English and get full DDL."
                badge="Text → SQL"  accentColor="bg-emerald-500" btnColor="bg-emerald-600 hover:bg-emerald-700" />
              <ToolCard delay={0.29} onClick={() => onNavigate("migrate")}
                icon={Bot}      title="SQL Migrator"     desc="Convert SQL scripts between PostgreSQL, MySQL, SQLite and more."
                badge="SQL → SQL"   accentColor="bg-sky-500"     btnColor="bg-sky-600 hover:bg-sky-700" />
              <ToolCard delay={0.32} onClick={() => onNavigate("playground")}
                icon={Terminal} title="SQL Playground"   desc="Write, visualize and export SQL with Monaco editor + live ER diagram."
                badge="DDL Editor"  accentColor="bg-violet-500" btnColor="bg-violet-600 hover:bg-violet-700" />
            </div>
          </motion.div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────────────────────── */}
        <div className="space-y-5">

          {/* Recent projects */}
          <motion.div {...fadeUp(0.18)} className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)]">Recent Projects</h2>
              <button onClick={() => onNavigate("projects")}
                className="text-xs font-bold text-[var(--primary)] hover:underline flex items-center gap-0.5">
                View all <ChevronRight size={13} />
              </button>
            </div>
            {recentProjects.length > 0 ? (
              <div className="space-y-2">
                {recentProjects.map((p, i) => {
                  const done  = p.files.filter(f => f.status === "completed").length;
                  const total = p.files.length;
                  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.05 }}
                      onClick={() => { useStore.getState().setActiveProject(p.id); onNavigate("project-detail"); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--surface)] transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "var(--primary-light)" }}>
                        <Database size={16} style={{ color: "var(--primary)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-[var(--text)] truncate group-hover:text-[var(--primary)] transition-colors">{p.name}</p>
                          {p.pinned && <Star size={11} className="fill-amber-400 text-amber-400 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-[var(--text-subtle)] tabular-nums flex-shrink-0">{done}/{total}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-[var(--text-subtle)]">{timeAgo(p.updatedAt)}</p>
                        <p className="text-xs font-bold text-[var(--text-muted)] uppercase mt-0.5">{p.dbType}</p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <FolderOpen size={32} className="text-[var(--text-subtle)]" />
                <p className="text-sm text-[var(--text-muted)]">No projects yet</p>
                <button onClick={() => onNavigate("projects")}
                  className="text-sm font-semibold text-[var(--primary)] hover:underline">
                  Create your first project →
                </button>
              </div>
            )}
          </motion.div>

          {/* Recent quick convert activity */}
          <motion.div {...fadeUp(0.24)} className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--text-subtle)]">Recent Activity</h2>
              <button onClick={() => onNavigate("history")}
                className="text-xs font-bold text-[var(--primary)] hover:underline flex items-center gap-0.5">
                History <ChevronRight size={13} />
              </button>
            </div>
            {recentActivity.length > 0 ? (
              <div className="space-y-2">
                {recentActivity.map((r, i) => (
                  <motion.div key={r.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.28 + i * 0.04 }}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--surface)] transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles size={15} className="text-sky-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">{r.filename}</p>
                      <p className="text-xs text-[var(--text-subtle)]">
                        {r.stats.tables} tables · {r.stats.relationships} rels
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-[var(--text-subtle)]">{timeAgo(r.timestamp)}</p>
                      <p className="text-xs font-bold text-emerald-500">Done</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Clock size={32} className="text-[var(--text-subtle)]" />
                <p className="text-sm text-[var(--text-muted)]">No recent activity</p>
                <button onClick={() => onNavigate("quick-convert")}
                  className="text-sm font-semibold text-[var(--primary)] hover:underline">
                  Try Quick Convert →
                </button>
              </div>
            )}
          </motion.div>

        </div>
      </div>

      <UpgradeLimitDialog
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        reason="conversions"
        onNavigatePricing={() => onNavigate("pricing")}
      />
    </div>
  );
}
