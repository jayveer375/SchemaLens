"use client";
import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Bot, Wand2, Search, Database, Copy, ExternalLink,
  CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronRight,
  MessageCircle, Send, Trash2, Zap, ShieldAlert, Lightbulb,
  Plus, FileCode, X,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { parseSQLSchema } from "@/lib/sqlParser";
import { analyzeSchema, generateSchemaAwareMockResponse, type AnalysisResult, type AnalysisFinding, type FindingSeverity } from "@/lib/schemaAnalyzer";
import toast from "react-hot-toast";
import {
  SQLResponseCard,
  SchemaIssueCard,
  AISuggestionCard,
  ExplanationResponseCard,
} from "@/components/AIResponseCards";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Mode   = "explain" | "generate" | "analyze" | "chat";
type Status = "idle" | "loading" | "done" | "error";

interface FindingItem {
  level: "good" | "warning" | "issue";
  title: string;
  detail: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;          // extracted SQL block from assistant reply
  timestamp: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema helpers — extract structured context from raw DDL SQL
// ─────────────────────────────────────────────────────────────────────────────

interface TableInfo {
  name: string;
  columns: string[];
  pks: string[];
  fks: string[];
}

/** Parse CREATE TABLE statements out of raw SQL into structured info */
function parseSchema(sql: string): TableInfo[] {
  const tables: TableInfo[] = [];
  // Normalize line endings, remove comments, collapse whitespace for reliable matching
  const normalized = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ");

  // Find CREATE TABLE positions and extract bodies using balanced-paren walk
  const headerRx = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?(\w+)["`\]]?\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = headerRx.exec(normalized)) !== null) {
    const name = m[1];
    // Walk forward from the opening paren to find the matching closing paren
    let depth = 1;
    let i = m.index + m[0].length;
    let body = "";
    while (i < normalized.length && depth > 0) {
      if (normalized[i] === "(") depth++;
      else if (normalized[i] === ")") { depth--; if (depth === 0) break; }
      body += normalized[i];
      i++;
    }

    const columns: string[] = [];
    const pks: string[] = [];
    const fks: string[] = [];

    const lines = body.split(/,(?![^(]*\))/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      const pkInline = line.match(/^["`\[]?(\w+)["`\]]?\s+\S.*PRIMARY\s+KEY/i);
      const pkTable  = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      const fkMatch  = line.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+["`\[]?(\w+)["`\]]?\s*\(([^)]+)\)/i);
      const colMatch = line.match(/^["`\[]?(\w+)["`\]]?\s+([A-Za-z_]\w*)/i);

      if (fkMatch) {
        fks.push(`${fkMatch[1].trim()} → ${fkMatch[2]}.${fkMatch[3].trim()}`);
      } else if (pkTable) {
        pkTable[1].split(",").map(c => c.trim().replace(/["`\[\]]/g, "")).forEach(c => pks.push(c));
      } else if (pkInline && colMatch) {
        pks.push(colMatch[1]);
        columns.push(colMatch[1]);
      } else if (colMatch && !line.match(/^\s*(UNIQUE|INDEX|KEY\s|CONSTRAINT|CHECK)/i)) {
        columns.push(colMatch[1]);
      }
    }

    tables.push({ name, columns, pks, fks });
  }
  return tables;
}

/** Build a compact human-readable schema summary for the AI */
function buildSchemaContext(sql: string): string {
  const tables = parseSchema(sql);
  if (!tables.length) return "";
  return tables.map(t => {
    const pkStr = t.pks.length  ? `  PKs: ${t.pks.join(", ")}` : "";
    const fkStr = t.fks.length  ? `  FKs: ${t.fks.join(" | ")}` : "";
    const colStr = t.columns.length ? `  Columns: ${t.columns.join(", ")}` : "";
    return [`Table: ${t.name}`, colStr, pkStr, fkStr].filter(Boolean).join("\n");
  }).join("\n\n");
}

/** Collect raw DDL from active project + playground — no credentials */
function collectSchema(
  projects: ReturnType<typeof useStore.getState>["projects"],
  activeProjectId: string | null,
  playgroundSQL: string | null,
): string {
  const parts: string[] = [];
  // Active project files take priority
  if (activeProjectId) {
    const proj = projects.find(p => p.id === activeProjectId);
    if (proj) {
      const sqls = proj.files
        .filter(f => f.status === "completed" && f.sql)
        .map(f => f.sql!.trim());
      if (sqls.length) {
        parts.push(`-- Project: ${proj.name}\n` + sqls.join("\n\n"));
      }
    }
  }
  // Playground seed SQL (populated when user sends SQL to playground)
  if (playgroundSQL?.trim()) {
    parts.push(`-- Playground SQL\n${playgroundSQL.trim()}`);
  }
  return parts.join("\n\n");
}

/** Extract inline SQL block from assistant reply (after "SQL:" marker or fenced) */
function extractSQLFromAnswer(text: string): { prose: string; sql: string } {
  // fenced code block
  const fenced = text.match(/```[\w]*\n([\s\S]*?)```/);
  if (fenced) {
    const sql   = fenced[1].trim();
    const prose = text.replace(/```[\w]*\n[\s\S]*?```/, "").trim();
    return { prose, sql };
  }
  // "SQL:" marker
  const marker = text.match(/^SQL:\s*\n([\s\S]+)/im);
  if (marker) {
    const idx   = text.search(/^SQL:\s*\n/im);
    const prose = text.slice(0, idx).trim();
    const sql   = marker[1].trim();
    return { prose, sql };
  }
  return { prose: text, sql: "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Small reusable UI pieces
// ─────────────────────────────────────────────────────────────────────────────

function ModeButton({ label, icon: Icon, active, onClick }: {
  label: string; icon: LucideIcon; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-all",
        active
          ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-sm"
          : "border-[var(--border)] text-[var(--text-muted)] bg-[var(--card)] hover:text-[var(--text)] hover:border-[var(--text-subtle)]"
      )}>
      <Icon size={13} />{label}
    </button>
  );
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-2 h-2 rounded-full bg-[var(--primary)] opacity-60"
          style={{ animation: `bounce-dot 1.4s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
    </div>
  );
}

function SQLBlock({ sql, onOpenPlayground }: { sql: string; onOpenPlayground?: (s: string) => void }) {
  return (
    <SQLResponseCard
      sql={sql}
      label="Generated SQL"
      onOpenPlayground={onOpenPlayground}
    />
  );
}

const FINDING_CONFIG: Record<FindingItem["level"], {
  icon: LucideIcon; color: string; bg: string; border: string; label: string;
}> = {
  good:    { icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20", label: "✓ Good"     },
  warning: { icon: AlertTriangle, color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-500/10",     border: "border-amber-200 dark:border-amber-500/20",   label: "⚠ Warning" },
  issue:   { icon: XCircle,       color: "text-red-600",     bg: "bg-red-50 dark:bg-red-500/10",         border: "border-red-200 dark:border-red-500/20",       label: "🔴 Issue"   },
};

// Quick action definitions — what they set (mode + prefilled input)
const QUICK_ACTIONS: { label: string; mode: Mode; input: string }[] = [
  { label: "Explain Schema",       mode: "chat",     input: "Explain this database structure in plain English. Describe what each table does and how they relate." },
  { label: "Find Relationships",   mode: "chat",     input: "Which tables are related to each other? List all foreign key relationships and explain what they mean." },
  { label: "Suggest Indexes",      mode: "chat",     input: "Suggest indexes that would improve query performance on this schema. Focus on foreign keys, frequently filtered columns, and join columns." },
  { label: "Check Normalization",  mode: "analyze",  input: "" },
  { label: "Generate SQL",         mode: "generate", input: "" },
];

// ─────────────────────────────────────────────────────────────────────────────
// LocalAnalysisCard — renders grouped findings from schemaAnalyzer (no API)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<FindingSeverity, {
  icon: LucideIcon; color: string; bg: string; border: string; groupLabel: string;
}> = {
  error:      { icon: XCircle,       color: "text-red-600",    bg: "bg-red-50 dark:bg-red-500/10",         border: "border-red-200 dark:border-red-500/20",       groupLabel: "Errors"      },
  warning:    { icon: AlertTriangle, color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-500/10",     border: "border-amber-200 dark:border-amber-500/20",   groupLabel: "Warnings"    },
  suggestion: { icon: Lightbulb,     color: "text-blue-600",   bg: "bg-blue-50 dark:bg-blue-500/10",       border: "border-blue-200 dark:border-blue-500/20",     groupLabel: "Suggestions" },
};

function FindingRow({ f, onOpenPlayground }: { f: AnalysisFinding; onOpenPlayground?: (s: string) => void }) {
  const extractedSql = f.fixHint && /(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|ADD CONSTRAINT)/i.test(f.fixHint)
    ? f.fixHint
    : undefined;

  if (f.severity === "suggestion") {
    return (
      <AISuggestionCard
        title={f.title}
        suggestion={f.detail}
        reason="Schema design review recommendation."
        expectedBenefit="Improves data consistency and query performance."
        sqlFix={extractedSql}
        onOpenPlayground={onOpenPlayground}
      />
    );
  }

  return (
    <SchemaIssueCard
      title={f.title}
      severity={f.severity === "error" ? "error" : "warning"}
      explanation={f.detail}
      whyItMatters={
        f.severity === "error"
          ? "Critical database structure issue that violates referential integrity or standard SQL execution."
          : "Potential performance bottleneck during JOIN execution or missing database index."
      }
      suggestedSolution={f.fixHint || "Add appropriate primary keys, foreign key constraints, or indexes."}
      sqlFix={extractedSql}
      table={f.table}
      column={f.column}
      onOpenPlayground={onOpenPlayground}
    />
  );
}

function LocalAnalysisCard({ result }: { result: AnalysisResult }) {
  const total = result.errors.length + result.warnings.length + result.suggestions.length;

  // Summary pills
  const pills = [
    { count: result.errors.length,      label: "Error",      color: "text-red-600",   bg: "bg-red-50 dark:bg-red-500/10",     border: "border-red-200 dark:border-red-500/20"   },
    { count: result.warnings.length,    label: "Warning",    color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-500/10", border: "border-amber-200 dark:border-amber-500/20" },
    { count: result.suggestions.length, label: "Suggestion", color: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-500/10",   border: "border-blue-200 dark:border-blue-500/20"  },
  ].filter(p => p.count > 0);

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]"
        style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-2.5">
          <ShieldAlert size={15} className="text-[var(--primary)]" />
          <span className="text-sm font-bold text-[var(--text)]">Database Analysis</span>
          <span className="text-[10px] font-semibold text-[var(--text-subtle)]">
            — {result.tableCount} table{result.tableCount !== 1 ? "s" : ""}, {result.columnCount} columns, {result.fkCount} FK{result.fkCount !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {total === 0 ? (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border border-emerald-200 dark:border-emerald-500/20">
              <CheckCircle2 size={10} /> All good
            </span>
          ) : (
            pills.map(p => (
              <span key={p.label}
                className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", p.color, p.bg, p.border)}>
                {p.count} {p.label}{p.count !== 1 ? "s" : ""}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {total === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CheckCircle2 size={24} className="text-emerald-500" />
            <p className="text-sm font-semibold text-[var(--text)]">No issues detected</p>
            <p className="text-xs text-[var(--text-muted)]">The schema passed all local checks. Run AI Deep Analysis for additional suggestions.</p>
          </div>
        )}

        {(["error", "warning", "suggestion"] as FindingSeverity[]).map(sev => {
          const group = sev === "error" ? result.errors : sev === "warning" ? result.warnings : result.suggestions;
          if (!group.length) return null;
          const cfg = SEVERITY_CONFIG[sev];
          const GIcon = cfg.icon;
          return (
            <div key={sev} className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <GIcon size={12} className={cfg.color} />
                <span className={cn("text-xs font-bold uppercase tracking-widest", cfg.color)}>
                  {cfg.groupLabel} ({group.length})
                </span>
              </div>
              {group.map(f => <FindingRow key={f.id} f={f} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function AssistantPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { projects, activeProjectId, setActiveProject, playgroundInitialSQL, setPlaygroundInitialSQL, copilotContext } = useStore();

  const [mode, setMode]     = useState<Mode>("chat");
  const [input, setInput]   = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setError] = useState("");
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedSQL, setPastedSQL] = useState("");

  // Dedicated mode results
  const [explanation,  setExplanation]  = useState("");
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [findings,     setFindings]     = useState<FindingItem[]>([]);

  // Local (client-side) schema analysis — no API call
  const [localAnalysis,      setLocalAnalysis]      = useState<AnalysisResult | null>(null);
  const [localAnalysisStatus, setLocalAnalysisStatus] = useState<"idle" | "done">("idle");

  // Chat history
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const schema        = collectSchema(projects, activeProjectId, playgroundInitialSQL);
  const schemaContext = buildSchemaContext(schema);
  const activeProject = activeProjectId ? projects.find(p => p.id === activeProjectId) : null;
  const tableCount    = parseSchema(schema).length;

  const copilotQuickActions = useMemo(() => {
    if (copilotContext?.source === "playground") {
      return [
        { label: "Explain SQL", mode: "chat" as Mode, input: "Explain this SQL query in detail step-by-step." },
        { label: "Optimize SQL", mode: "chat" as Mode, input: "Optimize this SQL query for performance and indexing." },
        { label: "Find Issues", mode: "chat" as Mode, input: "Check this SQL query for syntax errors, missing constraints, or risks." },
        { label: "Generate Alternative", mode: "chat" as Mode, input: "Provide a clean alternative version of this SQL query." },
      ];
    }
    if (copilotContext?.source === "er-diagram") {
      return [
        { label: "Analyze Diagram", mode: "analyze" as Mode, input: "" },
        { label: "Explain Relationships", mode: "chat" as Mode, input: "List and explain all foreign key relationships in this ER diagram." },
        { label: "Find Problems", mode: "analyze" as Mode, input: "" },
        { label: "Suggest Improvements", mode: "chat" as Mode, input: "Suggest table, column, and relationship improvements for this ER diagram." },
      ];
    }
    return [
      { label: "Explain Schema", mode: "chat" as Mode, input: "Explain this database structure in plain English. Describe what each table does and how they relate." },
      { label: "Find Relationships", mode: "chat" as Mode, input: "Which tables are related to each other? List all foreign key relationships and explain what they mean." },
      { label: "Suggest Indexes", mode: "chat" as Mode, input: "Suggest indexes that would improve query performance on this schema." },
      { label: "Check Normalization", mode: "analyze" as Mode, input: "" },
    ];
  }, [copilotContext?.source]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, status]);

  const handleConnectPastedSchema = () => {
    if (!pastedSQL.trim()) {
      toast.error("Please paste valid SQL DDL statements");
      return;
    }
    setPlaygroundInitialSQL(pastedSQL.trim());
    setShowPasteModal(false);
    setPastedSQL("");
    toast.success("Schema connected to AI Copilot!");
  };

  const clearResults = () => {
    setStatus("idle"); setError("");
    setExplanation(""); setGeneratedSQL(""); setFindings([]);
    setLocalAnalysis(null); setLocalAnalysisStatus("idle");
  };

  const switchMode = (m: Mode) => {
    setMode(m); clearResults();
    if (m === "analyze") setInput("");
  };

  // ── Local (instant, no API) schema analysis ────────────────────────────────
  const runLocalAnalysis = useCallback(() => {
    if (!schema) {
      toast.error("No schema loaded. Open a project with completed SQL files first.");
      return;
    }
    const result = analyzeSchema(schema);
    setLocalAnalysis(result);
    setLocalAnalysisStatus("done");
  }, [schema]);

  // ── Main run handler ────────────────────────────────────────────────────────
  const handleRun = useCallback(async (overrideInput?: string) => {
    const question = (overrideInput ?? input).trim();

    if (mode === "analyze" && !schema) {
      toast.error("No schema found. Open a project with completed SQL files first.");
      return;
    }
    if ((mode === "explain" || mode === "generate") && !question) {
      toast.error(mode === "explain" ? "Paste a SQL query to explain." : "Describe what you want.");
      return;
    }
    if (mode === "chat" && !question) {
      toast.error("Type a question first.");
      return;
    }

    // For chat mode: append user message immediately, stream loading below
    if (mode === "chat") {
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: question,
        timestamp: Date.now(),
      };
      setChatHistory(prev => [...prev, userMsg]);
      setInput("");
      setStatus("loading");
      setError("");

      try {
        const res  = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "chat", input: question, schema, schemaContext }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "Request failed");

        const { prose, sql } = extractSQLFromAnswer(data.answer ?? "");
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: prose,
          sql: sql || undefined,
          timestamp: Date.now(),
        };
        setChatHistory(prev => [...prev, assistantMsg]);
        setStatus("idle");
      } catch (err: unknown) {
        // Fallback to local schema-aware response engine when API fails or key is invalid
        const parsed = parseSQLSchema(schema);
        const mock = generateSchemaAwareMockResponse(question, parsed);
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: mock.prose,
          sql: mock.sql,
          timestamp: Date.now(),
        };
        setChatHistory(prev => [...prev, assistantMsg]);
        setStatus("idle");
        toast.error("Mistral API Key invalid/unconfigured. Falling back to local schema engine.", { duration: 4000 });
      }
      return;
    }

    // Non-chat modes
    setStatus("loading");
    setError("");
    setExplanation(""); setGeneratedSQL(""); setFindings([]);

    try {
      const res  = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, input: question, schema, schemaContext }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Request failed");

      if (mode === "explain")  setExplanation(data.explanation ?? "");
      if (mode === "generate") setGeneratedSQL(data.sql ?? "");
      if (mode === "analyze")  setFindings(data.findings ?? []);

      setStatus("done");
    } catch (err: unknown) {
      const parsed = parseSQLSchema(schema);
      const mock = generateSchemaAwareMockResponse(question, parsed);

      if (mode === "explain") {
        setExplanation(mock.prose);
        setStatus("done");
      } else if (mode === "generate") {
        setGeneratedSQL(mock.sql || "SELECT * FROM example_table;");
        setStatus("done");
      } else if (mode === "analyze") {
        runLocalAnalysis();
      } else {
        setError((err as Error).message ?? "Something went wrong");
        setStatus("error");
      }
      toast.error("Mistral API Key invalid/unconfigured. Falling back to local schema engine.", { duration: 4000 });
    }
  }, [mode, input, schema, schemaContext, runLocalAnalysis]);

  const openInPlayground = (sql: string) => {
    setPlaygroundInitialSQL(sql);
    onNavigate("playground");
  };

  // Quick action handler — runs immediately with explicit mode + input, no stale closure
  const runQuickAction = (action: typeof QUICK_ACTIONS[number]) => {
    setMode(action.mode);
    setStatus("idle"); setError("");
    setExplanation(""); setGeneratedSQL(""); setFindings([]);
    setLocalAnalysis(null); setLocalAnalysisStatus("idle");

    if (action.mode === "analyze") {
      if (!schema) { toast.error("No schema loaded."); return; }
      const result = analyzeSchema(schema);
      setLocalAnalysis(result);
      setLocalAnalysisStatus("done");
      return;
    }

    if (action.mode === "generate") {
      setInput("");
      return;
    }

    if (action.mode === "chat" && action.input) {
      handleRun(action.input);
    }
  };

  const MODES: { id: Mode; label: string; icon: LucideIcon }[] = [
    { id: "chat",     label: "Ask AI",        icon: MessageCircle },
    { id: "explain",  label: "Explain SQL",   icon: Search        },
    { id: "generate", label: "Generate SQL",  icon: Wand2         },
    { id: "analyze",  label: "Analyze Schema",icon: Database      },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-10 px-2 sm:px-4">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[var(--text)] tracking-tight">AI Database Assistant</h1>
          <p className="text-base text-[var(--text-muted)] mt-1">
            Ask questions, explain queries, generate SQL, or analyze your schema.
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold flex-shrink-0"
          style={{ background: "var(--primary-light)", color: "var(--primary)", borderColor: "var(--primary-border, rgba(37,99,235,0.25))" }}>
          <Bot size={15} /> Mistral AI
        </div>
      </div>

      {/* ── Mode tabs ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {MODES.map(m => (
          <ModeButton key={m.id} label={m.label} icon={m.icon}
            active={mode === m.id} onClick={() => switchMode(m.id)} />
        ))}
      </div>

      {/* ── Copilot Context banner ───────────────────────────────────────────── */}
      {schema ? (
        <div className="flex items-center justify-between gap-3 px-5 py-3 rounded-xl border text-sm font-medium"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <div className="flex items-center gap-3">
            <span className={cn(
              "w-2.5 h-2.5 rounded-full flex-shrink-0",
              copilotContext?.source === "playground"
                ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                : copilotContext?.source === "er-diagram"
                ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            )} />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[var(--text)]">
                {copilotContext?.source === "playground"
                  ? "Context: SQL Playground"
                  : copilotContext?.source === "er-diagram"
                  ? "Context: ER Diagram"
                  : `Schema loaded ${activeProject ? `— ${activeProject.name}` : "— Playground"}`}
              </span>
              {tableCount > 0 && (
                <span className="text-xs text-[var(--text-subtle)]">({tableCount} table{tableCount !== 1 ? "s" : ""})</span>
              )}
              {copilotContext?.selectedLinesCount && copilotContext.selectedLinesCount > 0 ? (
                <span className="px-2.5 py-0.5 rounded-md text-xs font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-bold">
                  Selected SQL: {copilotContext.selectedLinesCount} line{copilotContext.selectedLinesCount > 1 ? "s" : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {projects.length > 0 && (
              <select
                value={activeProjectId || ""}
                onChange={(e) => setActiveProject(e.target.value || null)}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold bg-[var(--card)] text-[var(--text)] border-[var(--border)] outline-none cursor-pointer hover:border-[var(--primary)] transition-all"
              >
                <option value="">Switch Project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.dbType})</option>
                ))}
              </select>
            )}
            <button
              onClick={() => setShowPasteModal(true)}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold bg-[var(--card)] text-[var(--primary)] border-[var(--primary-border,rgba(37,99,235,0.3))] hover:bg-[var(--primary-light)] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <FileCode size={13} /> Paste Schema
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[var(--text)]">No database schema currently loaded</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Select an existing project, paste SQL DDL statements, or create a new project.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0 w-full sm:w-auto">
            {projects.length > 0 && (
              <select
                value={activeProjectId || ""}
                onChange={(e) => setActiveProject(e.target.value || null)}
                className="px-3.5 py-2 rounded-xl border text-xs font-semibold bg-[var(--card)] text-[var(--text)] border-[var(--border)] outline-none cursor-pointer hover:border-[var(--primary)] transition-all"
              >
                <option value="">-- Select Project --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.dbType})
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => setShowPasteModal(true)}
              className="px-3.5 py-2 rounded-xl border text-xs font-semibold bg-[var(--card)] text-[var(--primary)] border-[var(--primary-border,rgba(37,99,235,0.3))] hover:bg-[var(--primary-light)] transition-all cursor-pointer flex items-center gap-1.5"
            >
              <FileCode size={13} /> Paste Schema
            </button>

            <button
              onClick={() => onNavigate("projects")}
              className="btn-primary text-xs px-3.5 py-2 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} /> Add Project
            </button>
          </div>
        </div>
      )}

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-subtle)] mb-2.5 flex items-center gap-1.5">
          <Zap size={12} /> Copilot Quick Actions
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          {copilotQuickActions.map((a: { label: string; mode: Mode; input: string }) => (
            <button key={a.label} onClick={() => runQuickAction(a)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border)]
                bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--primary)]
                hover:border-[var(--primary)]/40 transition-all cursor-pointer">
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CHAT MODE                                                            */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === "chat" && (
        <div className="space-y-3">
          {/* History + loading dots */}
          {(chatHistory.length > 0 || status === "loading") && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]"
                style={{ background: "var(--surface)" }}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-subtle)] flex items-center gap-1.5">
                  <MessageCircle size={11} /> Conversation
                </span>
                <button onClick={() => { setChatHistory([]); clearResults(); }}
                  className="flex items-center gap-1 text-[10px] text-[var(--text-subtle)] hover:text-red-500 transition-colors">
                  <Trash2 size={11} /> Clear
                </button>
              </div>
              <div className="p-5 space-y-4 min-h-[440px] max-h-[620px] overflow-y-auto">
                {chatHistory.map(msg => (
                  <div key={msg.id} className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && (
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                        style={{ background: "var(--primary-light)" }}>
                        <Bot size={15} style={{ color: "var(--primary)" }} />
                      </div>
                    )}
                    <div className={cn("max-w-[85%] space-y-2", msg.role === "user" ? "items-end" : "items-start")}>
                      {msg.role === "user" ? (
                        <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-white text-base leading-relaxed" style={{ background: "var(--primary)" }}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ) : (
                        <div className="space-y-2 w-full">
                          {msg.content.toLowerCase().includes("purpose") ||
                          msg.content.toLowerCase().includes("tables involved") ||
                          msg.content.toLowerCase().includes("join explanation") ? (
                            <ExplanationResponseCard rawText={msg.content} />
                          ) : (
                            <>
                              <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] text-base leading-relaxed">
                                <p className="whitespace-pre-wrap">{msg.content}</p>
                              </div>
                              <div className="flex items-center gap-2 pl-1">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.content);
                                    toast.success("Explanation copied!");
                                  }}
                                  className="text-xs font-semibold text-[var(--text-subtle)] hover:text-[var(--primary)] flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Copy size={12} /> Copy Explanation
                                </button>
                              </div>
                            </>
                          )}
                          {msg.sql && (
                            <SQLResponseCard sql={msg.sql} label="Generated SQL" onOpenPlayground={openInPlayground} />
                          )}
                        </div>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 bg-[var(--primary)]">
                        <span className="text-xs font-bold text-white">You</span>
                      </div>
                    )}
                  </div>
                ))}
                {status === "loading" && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                      style={{ background: "var(--primary-light)" }}>
                      <Bot size={15} style={{ color: "var(--primary)" }} />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm border border-[var(--border)]"
                      style={{ background: "var(--surface)" }}>
                      <LoadingDots />
                    </div>
                  </div>
                )}
                {status === "error" && (
                  <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-red-200 dark:border-red-500/20"
                    style={{ background: "rgba(220,38,38,0.04)" }}>
                    <XCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-base text-red-600 dark:text-red-400">{errorMsg}</p>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
          )}

          {/* Empty state — only when no history AND not loading */}
          {chatHistory.length === 0 && status !== "loading" && (
            <div className="card p-12 md:p-16 text-center min-h-[320px] flex flex-col items-center justify-center">
              <Bot size={38} className="mx-auto mb-4 text-[var(--primary)] opacity-75" />
              <p className="text-lg font-bold text-[var(--text)]">Ask anything about your database</p>
              <p className="text-sm text-[var(--text-muted)] mt-2 max-w-md mx-auto leading-relaxed">
                {schema
                  ? "Your schema is loaded. Try the quick actions above or type your own question."
                  : "Load a schema first, then ask me anything about your database design."}
              </p>
            </div>
          )}

          {/* Input */}
          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRun(); } }}
              placeholder={schema ? "Ask a question about your database…" : "Load a schema to start chatting…"}
              disabled={status === "loading"}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] text-base
                placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25
                focus:border-[var(--primary)] transition-all px-4 py-3 disabled:opacity-50"
            />
            <button onClick={() => handleRun()} disabled={status === "loading" || !input.trim()}
              className="btn-primary px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-base font-semibold">
              {status === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <p className="text-xs text-[var(--text-subtle)]">Press Enter to send · Shift+Enter for new line</p>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* EXPLAIN MODE                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === "explain" && (
        <div className="space-y-4">
          <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">SQL Query</label>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            placeholder="Paste the SQL query you want explained…"
            rows={9}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] text-base
              placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25
              focus:border-[var(--primary)] transition-all resize-y p-4 font-mono leading-relaxed"
          />
          <button onClick={() => handleRun()} disabled={status === "loading"}
            className="btn-primary text-sm px-5 py-2.5 disabled:opacity-60 flex items-center gap-2">
            {status === "loading" ? <><Loader2 size={13} className="animate-spin" />Explaining…</> : <><Search size={13} />Explain SQL</>}
          </button>
          {status === "loading" && (
            <div className="card flex items-center justify-center py-12 gap-3">
              <Loader2 size={18} className="text-[var(--primary)] animate-spin" />
              <span className="text-sm text-[var(--text-muted)]">AI is thinking…</span>
            </div>
          )}
          {status === "error" && (
            <div className="card p-4 border-red-200 dark:border-red-500/20" style={{ background: "rgba(220,38,38,0.04)" }}>
              <div className="flex gap-2"><XCircle size={15} className="text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p></div>
            </div>
          )}
          {status === "done" && explanation && (
            <ExplanationResponseCard rawText={explanation} />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* GENERATE MODE                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === "generate" && (
        <div className="space-y-4">
          <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Your Request</label>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            placeholder={"Describe what you want in plain English.\n\nExample: Find all users who registered after January 2025."}
            rows={7}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] text-base
              placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25
              focus:border-[var(--primary)] transition-all resize-y p-4 leading-relaxed"
          />
          <button onClick={() => handleRun()} disabled={status === "loading"}
            className="btn-primary text-sm px-5 py-2.5 disabled:opacity-60 flex items-center gap-2">
            {status === "loading" ? <><Loader2 size={13} className="animate-spin" />Generating…</> : <><Wand2 size={13} />Generate SQL</>}
          </button>
          {status === "loading" && (
            <div className="card flex items-center justify-center py-12 gap-3">
              <Loader2 size={18} className="text-[var(--primary)] animate-spin" />
              <span className="text-sm text-[var(--text-muted)]">AI is thinking…</span>
            </div>
          )}
          {status === "error" && (
            <div className="card p-4 border-red-200 dark:border-red-500/20" style={{ background: "rgba(220,38,38,0.04)" }}>
              <div className="flex gap-2"><XCircle size={15} className="text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p></div>
            </div>
          )}
          {status === "done" && generatedSQL && (
            <SQLBlock sql={generatedSQL} onOpenPlayground={openInPlayground} />
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* ANALYZE MODE                                                         */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {mode === "analyze" && (
        <div className="space-y-5">
          {/* Schema preview */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Schema Preview</label>
            {schema ? (
              <pre className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text-subtle)]
                text-sm font-mono p-4 overflow-auto leading-relaxed" style={{ maxHeight: 260 }}>
                {schema.slice(0, 1200)}{schema.length > 1200 ? "\n… (truncated)" : ""}
              </pre>
            ) : (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--text-subtle)]">
                No schema available.{" "}
                <button onClick={() => onNavigate("playground")} className="text-[var(--primary)] font-semibold hover:underline">
                  Open Playground →
                </button>
              </div>
            )}
          </div>

          {/* Action buttons row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Local analysis — instant, no API */}
            <button
              onClick={runLocalAnalysis}
              disabled={!schema}
              className="btn-primary text-sm px-5 py-2.5 disabled:opacity-60 flex items-center gap-2"
            >
              <ShieldAlert size={13} /> Analyze Schema
            </button>

            {/* AI deep analysis — uses API */}
            <button
              onClick={() => handleRun()}
              disabled={status === "loading" || !schema}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[var(--border)]
                bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-subtle)]
                transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "loading"
                ? <><Loader2 size={13} className="animate-spin" />Running AI…</>
                : <><Bot size={13} />AI Deep Analysis</>}
            </button>
          </div>

          {/* ── LOCAL ANALYSIS RESULTS ────────────────────────────────────── */}
          {localAnalysisStatus === "done" && localAnalysis && (
            <LocalAnalysisCard result={localAnalysis} />
          )}

          {/* ── AI ANALYSIS LOADING ───────────────────────────────────────── */}
          {status === "loading" && (
            <div className="card flex items-center justify-center py-12 gap-3">
              <Loader2 size={18} className="text-[var(--primary)] animate-spin" />
              <span className="text-sm text-[var(--text-muted)]">AI is thinking…</span>
            </div>
          )}

          {/* ── AI ANALYSIS ERROR ─────────────────────────────────────────── */}
          {status === "error" && (
            <div className="card p-4 border-red-200 dark:border-red-500/20" style={{ background: "rgba(220,38,38,0.04)" }}>
              <div className="flex gap-2">
                <XCircle size={15} className="text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* ── AI FINDINGS ───────────────────────────────────────────────── */}
          {status === "done" && findings.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bot size={13} className="text-[var(--primary)]" />
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-subtle)]">
                  AI findings — {findings.length} result{findings.length !== 1 ? "s" : ""}
                </span>
              </div>
              {[...findings]
                .sort((a, b) =>
                  (["issue","warning","good"] as FindingItem["level"][]).indexOf(a.level) -
                  (["issue","warning","good"] as FindingItem["level"][]).indexOf(b.level)
                )
                .map((f, i) => {
                  const extractedSql = f.detail.match(/(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|ADD CONSTRAINT)[\s\S]+/i)?.[0];
                  if (f.level === "good") {
                    return (
                      <AISuggestionCard
                        key={i}
                        title={f.title}
                        suggestion={f.detail}
                        reason="Validated structural pattern in database schema design."
                        expectedBenefit="Ensures optimal query execution and schema normalization."
                        sqlFix={extractedSql}
                        onOpenPlayground={openInPlayground}
                      />
                    );
                  }
                  return (
                    <SchemaIssueCard
                      key={i}
                      title={f.title}
                      severity={f.level === "issue" ? "error" : "warning"}
                      explanation={f.detail}
                      whyItMatters="Identified during AI deep architectural analysis of the schema."
                      suggestedSolution="Apply recommended SQL fixes or structural modifications."
                      sqlFix={extractedSql}
                      onOpenPlayground={openInPlayground}
                    />
                  );
                })}
            </div>
          )}
          {status === "done" && findings.length === 0 && (
            <div className="card p-5 text-center text-sm text-[var(--text-muted)]">
              No AI findings returned. Try providing a more complete schema.
            </div>
          )}
        </div>
      )}
    {/* ── Paste Schema Modal ─────────────────────────────────────────────────── */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="card w-full max-w-xl p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <FileCode size={18} className="text-[var(--primary)]" />
                <h3 className="text-base font-bold text-[var(--text)]">Paste Database Schema</h3>
              </div>
              <button
                onClick={() => setShowPasteModal(false)}
                className="p-1 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Paste your SQL DDL statements (e.g. <code className="font-mono text-[var(--primary)]">CREATE TABLE ...</code>) below to instantly connect schema context to the AI Copilot.
            </p>

            <textarea
              value={pastedSQL}
              onChange={(e) => setPastedSQL(e.target.value)}
              placeholder={`CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  name VARCHAR(120) NOT NULL,\n  email VARCHAR(255) NOT NULL UNIQUE\n);`}
              rows={8}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-xs font-mono p-4 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 focus:border-[var(--primary)] transition-all resize-y leading-relaxed"
            />

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                onClick={() => setShowPasteModal(false)}
                className="btn-ghost text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                onClick={handleConnectPastedSchema}
                disabled={!pastedSQL.trim()}
                className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
              >
                Connect Schema
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
