"use client";
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRightLeft, Database, Upload, Copy, Download,
  RefreshCw, CheckCircle, AlertTriangle, FileText,
  FileJson, ArrowRight, FileCode, Sparkles, X, Terminal,
  ChevronDown,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { downloadText, downloadJSON, parseSQLStats, formatTime, cn } from "@/lib/utils";import { canConvert, conversionsLeft } from "@/lib/subscription";
import UpgradeLimitDialog from "@/components/UpgradeLimitDialog";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";

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

const DB_OPTIONS = [
  { value: "postgresql", label: "PostgreSQL", short: "PG",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "mysql",      label: "MySQL",      short: "MY",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "sqlite",     label: "SQLite",     short: "SL",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "mssql",      label: "SQL Server", short: "SS",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "oracle",     label: "Oracle",     short: "ORA", color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
];

const PROCESS_STEPS = [
  "Reading source script…",
  "Analysing SQL statements…",
  "Mapping data types…",
  "Converting syntax…",
  "Generating output…",
];

const EXAMPLE_SCRIPTS: Record<string, string> = {
  postgresql: `-- PostgreSQL example
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) UNIQUE,
    active      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
    order_id    SERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    total       DECIMAL(10,2),
    created_at  TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

INSERT INTO customers (name, email, active) VALUES ('Alice', 'alice@example.com', TRUE);

CREATE OR REPLACE FUNCTION get_customer_orders(cid INT)
RETURNS TABLE(order_id INT, total DECIMAL) AS $$
BEGIN
    RETURN QUERY SELECT o.order_id, o.total FROM orders o WHERE o.customer_id = cid;
END;
$$ LANGUAGE plpgsql;`,

  mysql: `-- MySQL example
CREATE TABLE \`customers\` (
    \`customer_id\` INT AUTO_INCREMENT PRIMARY KEY,
    \`name\`        VARCHAR(100) NOT NULL,
    \`email\`       VARCHAR(255) UNIQUE,
    \`active\`      TINYINT(1) DEFAULT 1,
    \`created_at\`  DATETIME DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`customers\` (\`name\`, \`email\`, \`active\`) VALUES ('Alice', 'alice@example.com', 1);`,

  sqlite: `-- SQLite example
PRAGMA foreign_keys = ON;

CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT UNIQUE,
    active      INTEGER DEFAULT 1,
    created_at  TEXT DEFAULT (datetime('now'))
);

INSERT INTO customers (name, email, active) VALUES ('Alice', 'alice@example.com', 1);`,

  mssql: `-- SQL Server example
CREATE TABLE [customers] (
    [customer_id] INT IDENTITY(1,1) PRIMARY KEY,
    [name]        NVARCHAR(100) NOT NULL,
    [email]       NVARCHAR(255) UNIQUE,
    [active]      BIT DEFAULT 1,
    [created_at]  DATETIME2 DEFAULT GETDATE()
);

INSERT INTO [customers] ([name], [email], [active]) VALUES ('Alice', 'alice@example.com', 1);`,

  oracle: `-- Oracle example
CREATE TABLE customers (
    customer_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        VARCHAR2(100) NOT NULL,
    email       VARCHAR2(255) UNIQUE,
    active      NUMBER(1) DEFAULT 1,
    created_at  TIMESTAMP DEFAULT SYSTIMESTAMP
);

INSERT INTO customers (name, email, active) VALUES ('Alice', 'alice@example.com', 1);`,
};

interface MigrateResult {
  sql: string;
  source: string;
  target: string;
  processingTime: number;
  originalLines: number;
  convertedLines: number;
  stats: { tables: number; relationships: number; attributes: number };
}

// ── Dialect selector sub-component ──────────────────────────────────────────
function DialectPicker({
  label, value, onChange, exclude,
}: {
  label: string; value: string;
  onChange: (v: string) => void; exclude?: string;
}) {
  const options = DB_OPTIONS.filter(d => d.value !== exclude);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Database size={14} className="text-[var(--text-muted)]" />
        <span className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-widest">{label}</span>
      </div>

      {/* Mobile Dropdown (sm:hidden) */}
      <div className="sm:hidden relative mb-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-4 py-3 pr-10 rounded-xl text-base font-semibold border-2 border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:border-[var(--primary)] focus:outline-none transition-all shadow-sm"
        >
          {options.map((db) => (
            <option key={db.value} value={db.value} className="bg-[var(--card)] text-[var(--text)] py-1">
              {db.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-[var(--text-muted)]">
          <ChevronDown size={18} />
        </div>
      </div>

      {/* Desktop / Tablet Buttons (hidden sm:flex) */}
      <div className="hidden sm:flex flex-wrap gap-2">
        {options.map((db) => (
          <button
            key={db.value}
            onClick={() => onChange(db.value)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-all",
              value === db.value
                ? `${db.bg} ${db.color} ${db.border} shadow-sm scale-[1.03]`
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)] hover:text-[var(--text)] hover:scale-[1.02]"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", value === db.value ? "bg-current" : "bg-[var(--border)]")} />
            {db.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function MigratePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const {
    getSubscription, incrementConversions, theme, setPlaygroundInitialSQL,
    customColumns, globalPromptRules, autoApplyToAllTools,
  } = useStore();
  const sub = getSubscription();
  const activeCustomCols = (customColumns || []).filter((c) => c.enabled);

  const [sourceDialect, setSourceDialect] = useState("mysql");
  const [targetDialect, setTargetDialect] = useState("postgresql");
  const [inputSql, setInputSql]           = useState("");
  const [status, setStatus]               = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult]               = useState<MigrateResult | null>(null);
  const [error, setError]                 = useState("");
  const [step, setStep]                   = useState(0);
  const [limitOpen, setLimitOpen]         = useState(false);
  const [activeTab, setActiveTab]         = useState<"input" | "output">("input");
  const fileRef = useRef<HTMLInputElement>(null);

  const srcDb  = DB_OPTIONS.find(d => d.value === sourceDialect) ?? DB_OPTIONS[0];
  const tgtDb  = DB_OPTIONS.find(d => d.value === targetDialect) ?? DB_OPTIONS[1];
  const left   = conversionsLeft(sub);

  // ── Step animation ──────────────────────────────────────────────────────
  const runSteps = useCallback(() => {
    let s = 0; setStep(0);
    const id = setInterval(() => { s = Math.min(s + 1, PROCESS_STEPS.length - 1); setStep(s); }, 1500);
    return () => clearInterval(id);
  }, []);

  // ── Swap dialects ────────────────────────────────────────────────────────
  const swap = () => {
    setSourceDialect(targetDialect);
    setTargetDialect(sourceDialect);
    if (result) { setInputSql(result.sql); setResult(null); setStatus("idle"); }
  };

  // ── File upload ──────────────────────────────────────────────────────────
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(sql|txt)$/i)) { toast.error("Only .sql or .txt files"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text.length > 50_000) { toast.error("File too large (max 50 KB)"); return; }
      setInputSql(text);
      toast.success(`Loaded ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // ── Migrate ──────────────────────────────────────────────────────────────
  const migrate = useCallback(async () => {
    if (!inputSql.trim()) { toast.error("Paste or upload a SQL script first"); return; }
    if (!canConvert(sub)) { setLimitOpen(true); return; }
    if (sourceDialect === targetDialect) { toast.error("Source and target must be different"); return; }

    setStatus("processing");
    setError("");
    setResult(null);
    const stopSteps = runSteps();

    try {
      const t0  = Date.now();
      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sql: inputSql.trim(),
          source: sourceDialect,
          target: targetDialect,
          customColumns: autoApplyToAllTools ? activeCustomCols : [],
          customRules: autoApplyToAllTools ? globalPromptRules : "",
        }),
      });
      const data = await res.json();
      stopSteps();

      if (!res.ok || !data.sql) throw new Error(data.error || "Migration failed");

      const { tables, fks, cols } = parseSQLStats(data.sql);
      setResult({
        sql: data.sql,
        source: sourceDialect,
        target: targetDialect,
        processingTime: Date.now() - t0,
        originalLines: data.originalLines ?? inputSql.split("\n").length,
        convertedLines: data.convertedLines ?? data.sql.split("\n").length,
        stats: { tables, relationships: fks, attributes: cols },
      });
      setStatus("done");
      setActiveTab("output");
      incrementConversions();
      // ── Save to tool history ──
      const numericId = parseInt(useStore.getState().user?.id ?? "", 10);
      if (!isNaN(numericId)) {
        const { apiSaveToolHistory, apiSaveConversion } = await import("@/lib/api");
        apiSaveToolHistory({
          user_id: numericId,
          tool: "migrate",
          action_label: `${sourceDialect.toUpperCase()} → ${targetDialect.toUpperCase()}`,
          result_sql: data.sql,
          dialect_from: sourceDialect,
          dialect_to: targetDialect,
          tables_count: tables,
          processing_time_ms: Date.now() - t0,
          success: true,
          extra_json: { original_lines: data.originalLines, converted_lines: data.convertedLines },
        }).catch(() => {});
        // ── Save to conversions table in DB ──
        apiSaveConversion({
          user_id: numericId,
          generated_ddl: data.sql,
          dialect: targetDialect,
          success: true,
          tables_count: tables,
          execution_time_ms: Date.now() - t0,
          tool: "migrate",
        }).catch(() => {});
      }
      toast.success("Migration complete!");
    } catch (err: any) {
      stopSteps();
      setError(err.message || "Migration failed");
      setStatus("error");
      toast.error(err.message || "Migration failed");
    }
  }, [inputSql, sourceDialect, targetDialect, sub, runSteps, incrementConversions]);

  const reset = () => {
    setStatus("idle"); setResult(null); setError(""); setStep(0); setActiveTab("input");
  };

  const baseName = `${sourceDialect}_to_${targetDialect}`;

  return (
    <div className="w-full px-1">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <ArrowRightLeft size={22} className="text-primary-600" />
            <h1 className="text-3xl font-bold text-[var(--text)]">Script Migrator</h1>
            <span className="badge badge-emerald text-xs px-2.5 py-1">AI Powered</span>
          </div>
          <p className="text-base text-[var(--text-muted)]">
            Convert SQL scripts across dialects — tables, inserts, procedures, triggers &amp; more.&nbsp;
            <span className="font-semibold text-[var(--text)]">{left} conversion{left !== 1 ? "s" : ""}</span>
            &nbsp;remaining this month.
          </p>
        </div>
        {sub.planId !== "pro" && (
          <button onClick={() => onNavigate("pricing")}
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
              Customization Active: Preserving &amp; mapping <strong>{activeCustomCols.length} custom column{activeCustomCols.length !== 1 ? "s" : ""}</strong> ({activeCustomCols.map((c) => c.name).join(", ")}) during dialect conversion.
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

      {/* ── Dialect selectors ── */}
      <div className="card p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-5 items-start">
          {/* Source */}
          <DialectPicker
            label="Source Database"
            value={sourceDialect}
            onChange={(v) => { setSourceDialect(v); if (v === targetDialect) setTargetDialect(DB_OPTIONS.find(d => d.value !== v)!.value); }}
          />

          {/* Swap button */}
          <div className="flex items-center justify-center pt-8 md:pt-7">
            <motion.button
              whileHover={{ scale: 1.08, rotate: 180 }}
              whileTap={{ scale: 0.93 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              onClick={swap}
              title="Swap source and target"
              className="w-10 h-10 rounded-full border border-[var(--border)] bg-[var(--card)]
                flex items-center justify-center text-[var(--text-muted)]
                hover:border-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface)]
                transition-colors shadow-sm"
            >
              <ArrowRightLeft size={16} />
            </motion.button>
          </div>

          {/* Target */}
          <DialectPicker
            label="Target Database"
            value={targetDialect}
            onChange={(v) => { setTargetDialect(v); if (v === sourceDialect) setSourceDialect(DB_OPTIONS.find(d => d.value !== v)!.value); }}
          />
        </div>

        {/* Conversion badge */}
        <div className="flex items-center flex-wrap gap-3 mt-5 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center gap-3">
            <span className={cn("flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-bold border-2", srcDb.bg, srcDb.color, srcDb.border)}>
              <Database size={13} /> {srcDb.label}
            </span>
            <ArrowRight size={16} className="text-[var(--text-subtle)]" />
            <span className={cn("flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-bold border-2", tgtDb.bg, tgtDb.color, tgtDb.border)}>
              <Database size={13} /> {tgtDb.label}
            </span>
          </div>
          <span className="text-xs text-[var(--text-subtle)] w-full sm:w-auto sm:ml-2">Converts: CREATE TABLE · ALTER · INSERT · UPDATE · DELETE · PROCEDURE · TRIGGER · VIEW · INDEX</span>
        </div>
      </div>

      {/* ── Tabs: Input / Output ── */}
      <div className="card overflow-hidden mb-6">
        <div className="flex items-center border-b border-[var(--border)]">
          {(["input", "output"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn(
                "px-6 py-3.5 text-sm font-semibold transition-colors capitalize",
                activeTab === tab
                  ? "text-[var(--text)] border-b-2 border-[var(--text-subtle)] -mb-px bg-[var(--surface)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
              )}>
              {tab === "input" ? `Source SQL (${srcDb.label})` : `Converted SQL (${tgtDb.label})`}
              {tab === "output" && status === "done" && result && (
                <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600">
                  {result.convertedLines} lines
                </span>
              )}
            </button>
          ))}

          {/* Toolbar */}
          <div className="ml-auto flex items-center gap-1 pr-3">
            {activeTab === "input" && (
              <>
                {/* Load example */}
                <button
                  onClick={() => { setInputSql(EXAMPLE_SCRIPTS[sourceDialect] ?? ""); toast.success("Example loaded"); }}
                  className="btn-ghost text-xs px-3 py-1.5">
                  <Sparkles size={12} /> Example
                </button>
                {/* Upload file */}
                <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs px-3 py-1.5">
                  <Upload size={12} /> Upload .sql
                </button>
                <input ref={fileRef} type="file" accept=".sql,.txt" className="hidden" onChange={onFile} />
                {/* Clear */}
                {inputSql && (
                  <button onClick={() => { setInputSql(""); setStatus("idle"); setResult(null); }}
                    className="btn-ghost text-xs px-3 py-1.5">
                    <X size={12} /> Clear
                  </button>
                )}
              </>
            )}
            {activeTab === "output" && result && (
              <>
                <button onClick={() => { navigator.clipboard.writeText(result.sql); toast.success("Copied!"); }}
                  className="btn-ghost text-xs px-3 py-1.5">
                  <Copy size={12} /> Copy
                </button>
                <button onClick={() => downloadText(result.sql, `${baseName}.sql`)}
                  className="btn-ghost text-xs px-3 py-1.5">
                  <Download size={12} /> .sql
                </button>
                <button onClick={() => downloadText(result.sql, `${baseName}.txt`)}
                  className="btn-ghost text-xs px-3 py-1.5">
                  <FileText size={12} /> .txt
                </button>
                <button onClick={() => downloadJSON({ source: result.source, target: result.target, sql: result.sql }, `${baseName}.json`)}
                  className="btn-ghost text-xs px-3 py-1.5">
                  <FileJson size={12} /> .json
                </button>
                <button
                  onClick={() => { setPlaygroundInitialSQL(result.sql); onNavigate("playground"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ml-auto
                    bg-gradient-to-r from-emerald-600 to-emerald-700 text-white
                    hover:shadow-md hover:shadow-emerald-500/25 transition-all">
                  <Terminal size={12} /> Open in Playground
                </button>
              </>
            )}
          </div>
        </div>

        {/* Input tab */}
        {activeTab === "input" && (
          <div className="h-[480px]">
            <MonacoEditor
              height="100%"
              language="sql"
              value={inputSql}
              theme={theme === "dark" ? "vs-dark" : "light"}
              onChange={(v) => setInputSql(v ?? "")}
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                lineHeight: 22,
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                padding: { top: 16, bottom: 16 },
                scrollbar: { verticalScrollbarSize: 6 },
                placeholder: `-- Paste your ${srcDb.label} SQL here or click "Upload .sql" above\n-- Supports: CREATE TABLE, ALTER TABLE, INSERT, UPDATE, DELETE,\n--           stored procedures, triggers, views, indexes and more`,
              }}
            />
          </div>
        )}

        {/* Output tab */}
        {activeTab === "output" && (
          <AnimatePresence mode="wait">
            {status === "processing" && (
              <motion.div key="proc"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-[480px] flex flex-col items-center justify-center gap-8">
                <div className="relative w-16 h-16">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-[3px] border-primary-500 border-t-transparent" />
                  <div className="absolute inset-3 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-primary-500 animate-pulse" />
                  </div>
                </div>
                <div className="text-center">
                  <AnimatePresence mode="wait">
                    <motion.p key={step}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="text-lg font-bold text-[var(--text)] mb-1">
                      {PROCESS_STEPS[step]}
                    </motion.p>
                  </AnimatePresence>
                  <p className="text-sm text-[var(--text-muted)]">
                    <span className={cn("font-semibold", srcDb.color)}>{srcDb.label}</span>
                    &nbsp;→&nbsp;
                    <span className={cn("font-semibold", tgtDb.color)}>{tgtDb.label}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {PROCESS_STEPS.map((_, i) => (
                    <div key={i} className={cn("rounded-full transition-all duration-300",
                      i <= step ? "w-3 h-3 bg-primary-500" : "w-2.5 h-2.5 bg-[var(--border)]")} />
                  ))}
                </div>
              </motion.div>
            )}

            {status === "error" && (
              <motion.div key="err"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-[480px] flex flex-col items-center justify-center gap-5 text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle size={28} className="text-red-500" />
                </div>
                <div>
                  <p className="text-lg font-bold text-[var(--text)] mb-2">Migration Failed</p>
                  <p className="text-base text-[var(--text-muted)] max-w-sm">{error}</p>
                </div>
                <button onClick={() => { reset(); setActiveTab("input"); }} className="btn-primary text-sm px-6 py-2.5">
                  <RefreshCw size={14} /> Try Again
                </button>
              </motion.div>
            )}

            {status === "done" && result && (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-[480px]">
                <MonacoEditor
                  height="100%"
                  language="sql"
                  value={result.sql}
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
              </motion.div>
            )}

            {status === "idle" && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="h-[480px] flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] flex items-center justify-center">
                  <FileCode size={28} className="text-[var(--text-subtle)]" />
                </div>
                <p className="text-base font-semibold text-[var(--text-muted)]">No output yet</p>
                <p className="text-sm text-[var(--text-subtle)]">Paste your SQL in the Source tab and click Convert</p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* ── Convert button + stats ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Convert CTA */}
        <button
          onClick={migrate}
          disabled={status === "processing" || !inputSql.trim() || !canConvert(sub) || sourceDialect === targetDialect}
          className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl text-base font-semibold
            bg-gradient-to-r from-primary-600 to-primary-700 text-white
            hover:shadow-xl hover:shadow-primary-500/30 transition-all
            disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {status === "processing" ? (
            <>
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Converting…
            </>
          ) : (
            <>
              <ArrowRightLeft size={18} />
              Convert to {tgtDb.label}
            </>
          )}
        </button>

        {/* Reset */}
        {(status === "done" || inputSql) && (
          <button onClick={reset} className="btn-ghost text-sm px-4 py-3">
            <RefreshCw size={14} /> New Migration
          </button>
        )}

        {/* Result stats */}
        {status === "done" && result && (
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4 ml-auto flex-wrap">
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-4 py-2.5 rounded-xl border border-[var(--border)]">
              <CheckCircle size={15} className="text-emerald-500" />
              <span className="font-semibold text-[var(--text)]">{result.originalLines}</span> → <span className="font-semibold text-[var(--text)]">{result.convertedLines}</span> lines
            </div>
            {result.stats.tables > 0 && (
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-4 py-2.5 rounded-xl border border-[var(--border)]">
                <Database size={14} className="text-primary-600" />
                {result.stats.tables} table{result.stats.tables !== 1 ? "s" : ""}
              </div>
            )}
            <div className={cn("flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border-2", tgtDb.bg, tgtDb.color, tgtDb.border)}>
              <Database size={14} />
              {formatTime(result.processingTime)}
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Supported statements info ── */}
      <div className="mt-8 card p-5">
        <p className="text-sm font-bold text-[var(--text)] mb-3">What gets converted</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { icon: "🏗️", label: "CREATE TABLE" },
            { icon: "✏️", label: "ALTER TABLE" },
            { icon: "➕", label: "INSERT / UPDATE" },
            { icon: "⚙️", label: "Procedures" },
            { icon: "🔔", label: "Triggers" },
            { icon: "👁️", label: "Views & Indexes" },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
              <span className="text-base">{icon}</span>
              <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
            </div>
          ))}
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
