"use client";
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  Upload, FileCode, Clock, Copy, Download, RefreshCw,
  CheckCircle, AlertTriangle, Sparkles,
  FileText, FileJson, ArrowRight, Database,
  Table2, GitBranch, Timer, Terminal,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { parseSQLStats, downloadText, downloadJSON, genId, timeAgo, formatTime, cn } from "@/lib/utils";
import { canConvert, conversionsLeft } from "@/lib/subscription";
import type { QuickConvertResult } from "@/lib/types";
import UpgradeLimitDialog from "@/components/UpgradeLimitDialog";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { apiSaveConversion, apiClearQuickHistory } from "@/lib/api";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 space-y-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="skeleton h-4" style={{ width: `${35 + Math.random() * 55}%` }} />
        ))}
      </div>
    ),
  }
);

const PROCESS_STEPS = [
  "Analyzing Diagram…",
  "Reading Entities…",
  "Finding Relationships…",
  "Generating SQL…",
];

const DB_OPTIONS = [
  { value: "postgresql", label: "PostgreSQL", short: "PG",   color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "mysql",      label: "MySQL",      short: "MY",   color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "sqlite",     label: "SQLite",     short: "SL",   color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "mssql",      label: "SQL Server", short: "SS",   color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "oracle",     label: "Oracle",     short: "ORA",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
];

export default function QuickConvertPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const {
    getSubscription, incrementConversions,
    quickHistory, addQuickResult, clearQuickHistory,
    theme, user, setPlaygroundInitialSQL,
    customColumns, globalPromptRules, autoApplyToAllTools,
  } = useStore();

  const sub = getSubscription();
  const activeCustomCols = (customColumns || []).filter((c) => c.enabled);

  const [qcFile, setQcFile]       = useState<File | null>(null);
  const [qcPreview, setQcPreview] = useState<string | null>(null);
  const [qcStatus, setQcStatus]   = useState<"idle" | "processing" | "done" | "error">("idle");
  const [qcResult, setQcResult]   = useState<QuickConvertResult | null>(null);
  const [qcStep, setQcStep]       = useState(0);
  const [qcError, setQcError]     = useState("");
  const [limitOpen, setLimitOpen] = useState(false);
  const [selectedDb, setSelectedDb] = useState("postgresql");

  const activeDb = DB_OPTIONS.find((d) => d.value === selectedDb) ?? DB_OPTIONS[0];
  const left = conversionsLeft(sub);

  const runStepAnimation = useCallback(() => {
    let step = 0;
    setQcStep(0);
    const id = setInterval(() => {
      step = Math.min(step + 1, PROCESS_STEPS.length - 1);
      setQcStep(step);
    }, 1600);
    return () => clearInterval(id);
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (!canConvert(sub)) { setLimitOpen(true); return; }
      if (qcPreview) URL.revokeObjectURL(qcPreview);
      const url = URL.createObjectURL(file);
      setQcFile(file); setQcPreview(url);
      setQcStatus("processing"); setQcError(""); setQcResult(null);
      const stopAnim = runStepAnimation();
      try {
        const form = new FormData();
        form.append("image", file);
        form.append("dialect", selectedDb);
        if (autoApplyToAllTools && activeCustomCols.length > 0) {
          form.append("customColumns", JSON.stringify(activeCustomCols));
        }
        if (autoApplyToAllTools && globalPromptRules) {
          form.append("customRules", globalPromptRules);
        }
        const t0  = Date.now();
        const res = await fetch("/api/analyze", { method: "POST", body: form });
        const data = await res.json();
        stopAnim();
        if (!res.ok || !data.sql) throw new Error(data.error || "Analysis failed");
        const { tables, fks, cols } = parseSQLStats(data.sql);
        const result: QuickConvertResult = {
          id: genId(), filename: file.name, imageUrl: url,
          sql: data.sql, timestamp: Date.now(),
          processingTime: Date.now() - t0,
          stats: { tables, relationships: fks, attributes: cols },
        };
        setQcResult(result); setQcStatus("done");
        addQuickResult(result); incrementConversions();
        // ── Persist to PostgreSQL ──────────────────────────────────────────
        const numericId = parseInt(user?.id ?? "", 10);
        if (!isNaN(numericId)) {
          // 1. Upload image to DB → get image_id
          const { apiUploadImage, apiSaveQuickHistory: saveQH, apiSaveToolHistory: saveTH, apiSaveConversion: saveConv } = await import("@/lib/api");
          let imageId: number | undefined;
          try {
            const uploaded = await apiUploadImage(numericId, file);
            imageId = uploaded.image_id;
          } catch { /* non-fatal */ }

          // 2. Save quick history
          saveQH({ user_id: numericId, id: result.id, filename: result.filename, sql: result.sql, stats: result.stats, processingTime: result.processingTime }).catch(() => {});

          // 3. Save tool history
          saveTH({ user_id: numericId, tool: "quick_convert", action_label: `${result.filename} → ${selectedDb.toUpperCase()}`, result_sql: result.sql, dialect_from: "image", dialect_to: selectedDb, tables_count: result.stats.tables, processing_time_ms: result.processingTime, success: true, extra_json: { filename: result.filename, relationships: result.stats.relationships } }).catch(() => {});

          // 4. Save conversion with image_id
          saveConv({ user_id: numericId, image_id: imageId, generated_ddl: result.sql, dialect: selectedDb, success: true, tables_count: result.stats.tables, relationships_count: result.stats.relationships, execution_time_ms: result.processingTime, tool: "quick_convert" }).catch(() => {});
        }
        toast.success("Conversion complete!");
      } catch (err: any) {
        stopAnim();
        setQcError(err.message || "Failed to analyze");
        setQcStatus("error");
        toast.error(err.message || "Analysis failed");
      }
    },
    [sub, qcPreview, runStepAnimation, addQuickResult, incrementConversions, selectedDb, user]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && processFile(files[0]),
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] },
    multiple: false,
    disabled: qcStatus === "processing",
  });

  const reset = () => {
    if (qcPreview) URL.revokeObjectURL(qcPreview);
    setQcFile(null); setQcPreview(null);
    setQcStatus("idle"); setQcResult(null);
    setQcError(""); setQcStep(0);
  };

  return (
    <div className="w-full px-1">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Sparkles size={22} className="text-[var(--text-muted)]" />
            <h1 className="text-3xl font-bold text-[var(--text)]">Quick Convert</h1>
            <span className="badge badge-gray text-xs px-2.5 py-1">No project needed</span>
          </div>
          <p className="text-base text-[var(--text-muted)]">
            Upload an ER diagram and get executable SQL instantly.&nbsp;
            <span className="font-semibold text-[var(--text)]">{left} conversion{left !== 1 ? "s" : ""}</span>
            &nbsp;remaining this month.
          </p>
        </div>
        {sub.planId !== "pro" && (
          <button
            onClick={() => onNavigate("pricing")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0 text-white transition-all duration-200"
            style={{ background: "var(--primary)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--primary-hover)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--primary)")}
          >
            Upgrade to Pro <ArrowRight size={14} />
          </button>
        )}
      </div>

      {/* Active Customization Indicator */}
      {autoApplyToAllTools && activeCustomCols.length > 0 && (
        <div className="mb-6 p-3 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 font-medium">
            <Sparkles size={14} className="shrink-0" />
            <span>
              Customization Active: Applying <strong>{activeCustomCols.length} custom column{activeCustomCols.length !== 1 ? "s" : ""}</strong> ({activeCustomCols.map((c) => c.name).join(", ")})
            </span>
          </div>
          <button
            onClick={() => onNavigate("settings")}
            className="text-xs text-primary-600 dark:text-primary-400 underline hover:opacity-80 shrink-0"
          >
            Customize
          </button>
        </div>
      )}

      {/* ── Database Selector ── */}
      <div className="mb-7">
        <div className="flex items-center gap-2 mb-3">
          <Database size={15} className="text-[var(--text-muted)]" />
          <span className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Target Database
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-3">
          {DB_OPTIONS.map((db) => (
            <button
              key={db.value}
              onClick={() => { setSelectedDb(db.value); if (qcStatus === "done") reset(); }}
              className={cn(
                "flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all",
                selectedDb === db.value
                  ? `${db.bg} ${db.color} ${db.border} shadow-sm scale-[1.03]`
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)] hover:text-[var(--text)] hover:scale-[1.02]"
              )}
            >
              <span className={cn(
                "w-2.5 h-2.5 rounded-full transition-colors",
                selectedDb === db.value ? "bg-current" : "bg-[var(--border)]"
              )} />
              {db.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-7">

        {/* ── Left: converter ── */}
        <div className="space-y-5 min-w-0">
          <AnimatePresence mode="wait">

            {/* IDLE */}
            {qcStatus === "idle" && (
              <motion.div key="idle"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                <div
                  {...(getRootProps() as any)}
                  className={cn(
                    "upload-zone flex flex-col items-center justify-center gap-6 py-24 px-8 text-center cursor-pointer",
                    isDragActive && "drag-over",
                    !canConvert(sub) && "opacity-50 pointer-events-none"
                  )}
                >
                  <input {...getInputProps()} />
                  <motion.div
                    animate={isDragActive ? { scale: 1.18, rotate: -5 } : { scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="w-20 h-20 rounded-2xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center"
                  >
                    <Upload size={34} className="text-[var(--text-muted)]" />
                  </motion.div>
                  <div>
                    <p className="font-bold text-[var(--text)] text-2xl mb-2">
                      {isDragActive ? "Drop to convert" : "Drag & drop your ER diagram"}
                    </p>
                    <p className="text-base text-[var(--text-muted)]">
                      or{" "}
                      <span className="text-[var(--text)] font-semibold underline decoration-dotted cursor-pointer">
                        click to browse
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap justify-center mt-1">
                    {["PNG", "JPG", "JPEG", "WEBP"].map((f) => (
                      <span key={f} className="badge badge-gray font-mono text-xs px-3 py-1">.{f}</span>
                    ))}
                  </div>
                  {!canConvert(sub) && (
                    <div className="flex items-center gap-2 text-sm text-red-500 font-semibold">
                      <AlertTriangle size={15} />
                      Monthly limit reached ·{" "}
                      <button onClick={() => onNavigate("pricing")} className="underline">
                        Upgrade to continue
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* PROCESSING */}
            {qcStatus === "processing" && (
              <motion.div key="processing"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="card p-20 flex flex-col items-center gap-8"
              >
                <div className="relative w-20 h-20">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-[3px] border-primary-500 border-t-transparent"
                  />
                  <div className="absolute inset-3 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                    <div className="w-4 h-4 rounded-full bg-primary-500 animate-pulse" />
                  </div>
                </div>
                <div className="text-center">
                  <AnimatePresence mode="wait">
                    <motion.p key={qcStep}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="text-xl font-bold text-[var(--text)] mb-2"
                    >
                      {PROCESS_STEPS[qcStep]}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-sm text-[var(--text-muted)]">{qcFile?.name}</p>
                  <p className="text-sm text-[var(--text-subtle)] mt-1">
                    Generating <span className={cn("font-semibold", activeDb.color)}>{activeDb.label}</span> DDL
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {PROCESS_STEPS.map((_, i) => (
                    <div key={i} className={cn(
                      "rounded-full transition-all duration-300",
                      i <= qcStep ? "w-3 h-3 bg-primary-500" : "w-2.5 h-2.5 bg-[var(--border)]"
                    )} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* DONE */}
            {qcStatus === "done" && qcResult && (
              <motion.div key="done"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* Result summary card */}
                <div className="card p-5">
                  {/* Top row */}
                  <div className="flex items-start gap-4 mb-5">
                    {qcPreview && (
                      <img src={qcPreview} alt={qcResult.filename}
                        className="w-28 h-20 object-cover rounded-xl border border-[var(--border)] flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                        <p className="text-base font-bold text-[var(--text)] truncate">{qcResult.filename}</p>
                      </div>
                      {/* Stats pills */}
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-3 py-1 rounded-lg border border-[var(--border)]">
                          <Table2 size={13} />
                          {qcResult.stats.tables} tables
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-3 py-1 rounded-lg border border-[var(--border)]">
                          <GitBranch size={13} />
                          {qcResult.stats.relationships} relationships
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-3 py-1 rounded-lg border border-[var(--border)]">
                          <Timer size={13} />
                          {formatTime(qcResult.processingTime)}
                        </span>
                        <span className={cn(
                          "flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-lg border",
                          activeDb.bg, activeDb.color, activeDb.border
                        )}>
                          <Database size={13} />
                          {activeDb.label}
                        </span>
                      </div>
                    </div>
                    <button onClick={reset}
                      className="btn-ghost text-sm px-4 py-2 flex items-center gap-1.5 shrink-0">
                      <RefreshCw size={13} /> New
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-[var(--border)]">
                    <span className="text-sm font-semibold text-[var(--text-muted)] mr-1">Export as:</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(qcResult.sql); toast.success("Copied!"); }}
                      className="btn-ghost text-sm px-4 py-2">
                      <Copy size={14} /> Copy SQL
                    </button>
                    <button
                      onClick={() => downloadText(qcResult.sql, `${qcResult.filename.replace(/\.[^.]+$/, "")}.sql`)}
                      className="btn-ghost text-sm px-4 py-2">
                      <Download size={14} /> .sql
                    </button>
                    <button
                      onClick={() => downloadText(qcResult.sql, `${qcResult.filename.replace(/\.[^.]+$/, "")}.txt`)}
                      className="btn-ghost text-sm px-4 py-2">
                      <FileText size={14} /> .txt
                    </button>
                    <button
                      onClick={() => downloadJSON({ filename: qcResult.filename, sql: qcResult.sql, stats: qcResult.stats }, `${qcResult.filename.replace(/\.[^.]+$/, "")}.json`)}
                      className="btn-ghost text-sm px-4 py-2">
                      <FileJson size={14} /> .json
                    </button>
                    <button
                      onClick={() => { setPlaygroundInitialSQL(qcResult.sql); onNavigate("playground"); }}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold ml-auto
                        bg-gradient-to-r from-emerald-600 to-emerald-700 text-white
                        hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
                    >
                      <Terminal size={14} /> Open in Playground
                    </button>
                  </div>
                </div>

                {/* Monaco Editor */}
                <div className="card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
                    <span className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest">
                      Generated SQL
                    </span>
                    <span className="text-xs font-mono text-[var(--text-subtle)]">
                      {qcResult.sql.split("\n").length} lines
                    </span>
                  </div>
                  <div className="h-[520px]">
                    <MonacoEditor
                      height="100%"
                      language="sql"
                      value={qcResult.sql}
                      theme={theme === "dark" ? "vs-dark" : "light"}
                      options={{
                        readOnly: true,
                        fontSize: 14,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        lineHeight: 22,
                        minimap: { enabled: false },
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        padding: { top: 16, bottom: 16 },
                        scrollbar: { verticalScrollbarSize: 6 },
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ERROR */}
            {qcStatus === "error" && (
              <motion.div key="error"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="card p-16 flex flex-col items-center gap-5 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle size={28} className="text-red-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text)] mb-2">Conversion Failed</p>
                  <p className="text-base text-[var(--text-muted)] max-w-sm">{qcError}</p>
                </div>
                <button onClick={reset} className="btn-primary text-sm px-6 py-2.5">
                  <RefreshCw size={15} /> Try Again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right: Quick History ── */}
        <div className="min-w-0">
          {quickHistory.length === 0 ? (
            <div className="card p-8 flex flex-col items-center gap-4 text-center">
              <Clock size={30} className="text-[var(--text-subtle)]" />
              <div>
                <p className="text-base font-bold text-[var(--text-muted)]">No history yet</p>
                <p className="text-sm text-[var(--text-subtle)] mt-1">
                  Your recent conversions will appear here
                </p>
              </div>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <h3 className="text-base font-bold text-[var(--text)]">Recent Conversions</h3>
                <button onClick={() => {
                  clearQuickHistory();
                  const numericId = parseInt(user?.id ?? "", 10);
                  if (!isNaN(numericId)) apiClearQuickHistory(numericId).catch(() => {});
                }}
                  className="text-sm text-[var(--text-subtle)] hover:text-red-500 transition-colors font-medium">
                  Clear
                </button>
              </div>
              <div className="divide-y divide-[var(--border)] max-h-[600px] overflow-y-auto">
                {quickHistory.slice(0, 20).map((r) => (
                  <button key={r.id}
                    onClick={() => { setQcResult(r); setQcStatus("done"); setQcPreview(r.imageUrl); }}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[var(--surface)] transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <FileCode size={15} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">
                        {r.filename.replace(/\.[^.]+$/, "")}.sql
                      </p>
                      <p className="text-xs text-[var(--text-subtle)] mt-0.5">
                        {r.stats.tables} tables · {timeAgo(r.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(r.sql); toast.success("Copied!"); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--border)] transition-colors"
                    >
                      <Copy size={13} />
                    </button>
                  </button>
                ))}
              </div>
            </div>
          )}
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
