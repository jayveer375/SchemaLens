"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Wand2,
  Copy,
  Download,
  CheckCircle2,
  XCircle,
  Terminal,
  ChevronDown,
  ChevronUp,
  Code2,
  Clock,
  Database,
  Zap,
  Table,
  History,
  X,
  RotateCcw,
  GitFork,
  Table2,
  Share2,
  Layers,
  GitBranch,
  Sparkles,
  Loader2,
} from "lucide-react";
import { cn, downloadText } from "@/lib/utils";
import { parseSQLSchema } from "@/lib/sqlParser";
import { useStore } from "@/lib/store";
import { canUsePlayground, canGenerateAI, aiGenerationsLeft, getQuestionCreditCost } from "@/lib/subscription";
import toast from "react-hot-toast";
import ERDiagramModal from "@/components/ERDiagramModal";
import type { DiagramType } from "@/components/ERDiagramModal";

// ── Monaco editor (client-only) ──────────────────────────────────────────────
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 p-6 space-y-3 bg-[var(--card)]">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="skeleton skeleton-text"
            style={{ width: `${25 + Math.random() * 55}%` }}
          />
        ))}
      </div>
    ),
  }
);

// ── Default SQL ───────────────────────────────────────────────────────────────
const DEFAULT_SQL = `-- SQL Playground — Schemalens
-- Press Ctrl+Enter to run  |  Ctrl+S to download schema.sql

CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        VARCHAR(20)  NOT NULL DEFAULT 'user',
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(100) NOT NULL,
  slug  VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE products (
  id           SERIAL        PRIMARY KEY,
  category_id  INT           NOT NULL REFERENCES categories(id),
  name         VARCHAR(200)  NOT NULL,
  description  TEXT,
  price        NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock        INT           NOT NULL DEFAULT 0,
  created_at   TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id          SERIAL        PRIMARY KEY,
  user_id     INT           NOT NULL REFERENCES users(id),
  status      VARCHAR(30)   NOT NULL DEFAULT 'pending',
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  ordered_at  TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE TABLE order_items (
  id          SERIAL        PRIMARY KEY,
  order_id    INT           NOT NULL REFERENCES orders(id),
  product_id  INT           NOT NULL REFERENCES products(id),
  quantity    INT           NOT NULL DEFAULT 1,
  unit_price  NUMERIC(10,2) NOT NULL
);
`;

// ── Types ─────────────────────────────────────────────────────────────────────
type ResultStatus = "idle" | "success" | "error";

interface ExecutionResult {
  status: ResultStatus;
  message: string;
  detail?: string;
  executedAt?: Date;
  duration?: number;
  sql?: string;
}

interface HistoryEntry {
  id: string;
  sql: string;
  result: ExecutionResult;
  timestamp: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectErrorLine(sql: string): number {
  const lines = sql.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("--")) continue;
    const opens = (line.match(/\(/g) || []).length;
    const closes = (line.match(/\)/g) || []).length;
    if (opens !== closes) return i + 1;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith("--")) return i + 1;
  }
  return 1;
}

function mockExecute(sql: string): ExecutionResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return {
      status: "error",
      message: "Empty query",
      detail: "Please write a SQL statement before running.",
    };
  }

  const hasCreate = /CREATE\s+TABLE/i.test(trimmed);

  if (hasCreate) {
    const tableMatches =
      trimmed.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi) || [];
    const tableNames = tableMatches.map((m) => {
      const match = m.match(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/i
      );
      return match?.[1] ?? "unknown";
    });
    return {
      status: "success",
      message: "Query executed successfully",
      detail:
        tableNames.length > 0
          ? `Created ${tableNames.length} table${tableNames.length > 1 ? "s" : ""}: ${tableNames.join(", ")}`
          : "DDL statement executed.",
      executedAt: new Date(),
      duration: Math.floor(Math.random() * 40) + 8,
    };
  }

  const errorLine = detectErrorLine(trimmed);
  return {
    status: "error",
    message: `Syntax Error near line ${errorLine}`,
    detail:
      "Expected CREATE TABLE statement. Only DDL (CREATE TABLE) is supported in this playground.",
    executedAt: new Date(),
    duration: Math.floor(Math.random() * 10) + 2,
  };
}

// ── Pro-only gate ─────────────────────────────────────────────────────────────
function PlaygroundLocked() {
  // Read navigate from the main app store — we can't call onNavigate here
  // since playground/page.tsx is loaded without props in some routes.
  // Instead we dispatch a custom event that page.tsx (SPA root) listens to.
  const goToPricing = () => {
    window.dispatchEvent(new CustomEvent("navigate", { detail: "pricing" }));
  };

  return (
    <div
      className="flex flex-col items-center justify-center"
      style={{ height: "calc(100vh - 57px)", background: "var(--surface)" }}
    >
      {/* Glow backdrop */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(ellipse,rgba(139,170,130,0.07) 0%,transparent 70%)", filter: "blur(60px)" }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex flex-col items-center gap-6 text-center max-w-md px-6"
      >
        {/* Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--card)", border: "1px solid var(--border)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
            <Terminal size={32} style={{ color: "var(--primary)" }} />
          </div>
          {/* Lock badge */}
          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--warning)", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
            <span className="text-base leading-none">🔒</span>
          </div>
        </div>

        {/* Heading */}
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold mb-3"
            style={{ background: "rgba(139,170,130,0.12)", color: "var(--primary)",
              border: "1px solid rgba(139,170,130,0.25)" }}>
            <Zap size={11} /> Pro Feature
          </div>
          <h2 className="text-2xl font-bold text-[var(--text)] mb-2">
            SQL Playground
          </h2>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            The SQL Playground — Monaco editor, live ER diagrams, format &amp; export — is available on the Pro plan.
          </p>
        </div>

        {/* Feature list */}
        <div className="w-full card p-5 text-left space-y-3">
          {[
            { icon: "⚡", text: "Monaco editor with SQL syntax highlighting" },
            { icon: "🔀", text: "Live ER diagrams, flowcharts & DFD" },
            { icon: "📋", text: "Format, copy and download schema.sql" },
            { icon: "📜", text: "Full query history (last 50 runs)" },
            { icon: "🔎", text: "Table explorer from your SQL" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <span className="text-base leading-none flex-shrink-0">{icon}</span>
              <span className="text-sm text-[var(--text-muted)]">{text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3 w-full">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={goToPricing}
            className="btn-primary w-full justify-center py-3 text-sm font-bold"
          >
            <Zap size={15} className="text-yellow-300" />
            Upgrade to Pro — ₹199 / month
          </motion.button>
          <p className="text-[11px] text-[var(--text-subtle)]">
            Instant access after upgrade · Cancel anytime
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function sanitizeSQLContext(text: string): string {
  if (!text) return "";
  return text
    .replace(/(password|secret|pwd|api_key|token)\s*(=|:)\s*['"][^'"]+['"]/gi, "$1 = '***MASKED***'")
    .replace(/(password|secret|pwd|api_key|token)\s*(=|:)\s*([^\s,;\)]+)/gi, "$1 = ***MASKED***");
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PlaygroundPage() {
  const { theme, playgroundInitialSQL, setPlaygroundInitialSQL, setCopilotContext, getSubscription, incrementAIGenerations } = useStore();
  const subscription = getSubscription();
  const isPro = canUsePlayground(subscription);
  const canUseAI = canGenerateAI(subscription);
  const creditsLeft = aiGenerationsLeft(subscription);

  // Lock playground for Pro users only (Monaco editor, diagrams, etc.)
  // Free users can use AI SQL Generator on the Generate page
  if (!isPro) {
    return <PlaygroundLocked />;
  }
  const [sql, setSql] = useState(playgroundInitialSQL || DEFAULT_SQL);
  const [result, setResult] = useState<ExecutionResult>({ status: "idle", message: "" });
  const [outputOpen, setOutputOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tablesOpen, setTablesOpen] = useState(false);
  const [erDiagramOpen, setErDiagramOpen] = useState(false);
  const [diagramInitialTab, setDiagramInitialTab] = useState<DiagramType>("er");
  const [diagramDropdownOpen, setDiagramDropdownOpen] = useState(false);
  const [diagramDropdownPos, setDiagramDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const diagramDropdownRef = useRef<HTMLDivElement>(null);
  const diagramBtnRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<unknown>(null);
  const monacoRef = useRef<unknown>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  
  // AI SQL Generator state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedSQL, setAiGeneratedSQL] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);

  const monacoTheme = theme === "dark" ? "playground-dark" : "playground-light";

  // Sync Copilot Context with store whenever SQL or diagram mode changes
  useEffect(() => {
    setCopilotContext({
      source: erDiagramOpen ? "er-diagram" : "playground",
      currentSql: sanitizeSQLContext(sql),
    });
  }, [sql, erDiagramOpen, setCopilotContext]);

  // ── Register custom Monaco themes ─────────────────────────────────────────
  const handleEditorWillMount = useCallback((monaco: any) => {
    monacoRef.current = monaco;

    monaco.editor.defineTheme("playground-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword.sql",       foreground: "8BAA82", fontStyle: "bold" },
        { token: "string.sql",        foreground: "C89B5E" },
        { token: "number",            foreground: "9ECBFF" },
        { token: "comment.line.sql",  foreground: "6B7280", fontStyle: "italic" },
        { token: "comment.block.sql", foreground: "6B7280", fontStyle: "italic" },
        { token: "delimiter.sql",     foreground: "9D9488" },
        { token: "identifier.sql",    foreground: "F7F3E8" },
        { token: "operator.sql",      foreground: "D96C6C" },
      ],
      colors: {
        "editor.background":              "#1C1718",
        "editor.foreground":              "#F7F3E8",
        "editor.lineHighlightBackground": "#221C1D",
        "editor.selectionBackground":     "#8BAA8230",
        "editorCursor.foreground":        "#8BAA82",
        "editorLineNumber.foreground":    "#5A4A4B",
        "editorLineNumber.activeForeground": "#9D9488",
        "editorIndentGuide.background":   "#3A2F30",
        "editorIndentGuide.activeBackground": "#5A4A4B",
        "scrollbarSlider.background":     "#3A2F3080",
        "scrollbarSlider.hoverBackground":"#5A4A4B80",
        "scrollbarSlider.activeBackground":"#8BAA8280",
      },
    });

    monaco.editor.defineTheme("playground-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "keyword.sql",       foreground: "2563EB", fontStyle: "bold" },
        { token: "string.sql",        foreground: "D97706" },
        { token: "number",            foreground: "0284C7" },
        { token: "comment.line.sql",  foreground: "94A3B8", fontStyle: "italic" },
        { token: "comment.block.sql", foreground: "94A3B8", fontStyle: "italic" },
        { token: "identifier.sql",    foreground: "1E1B18" },
        { token: "operator.sql",      foreground: "DC2626" },
      ],
      colors: {
        "editor.background":              "#F8FAFB",
        "editor.foreground":              "#1E1B18",
        "editor.lineHighlightBackground": "#F1F5F9",
        "editor.selectionBackground":     "#DBEAFE",
        "editorCursor.foreground":        "#2563EB",
        "editorLineNumber.foreground":    "#CBD5E1",
        "editorLineNumber.activeForeground": "#475569",
        "editorIndentGuide.background":   "#E8E3DC",
        "editorIndentGuide.activeBackground": "#CBD5E1",
        "scrollbarSlider.background":     "#D1D5DB80",
        "scrollbarSlider.hoverBackground":"#94A3B880",
      },
    });
  }, []);

  const handleEditorDidMount = useCallback(
    (editor: any, monaco: any) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      monaco.editor.setTheme(monacoTheme);

      // Listen for text selections to update Copilot context
      editor.onDidChangeCursorSelection(() => {
        const selection = editor.getSelection();
        const model = editor.getModel();
        if (selection && model && !selection.isEmpty()) {
          const selectedText = model.getValueInRange(selection);
          const lineCount = Math.abs(selection.endLineNumber - selection.startLineNumber) + 1;
          setCopilotContext({
            source: "playground",
            selectedSql: sanitizeSQLContext(selectedText),
            selectedLinesCount: lineCount,
          });
        } else {
          setCopilotContext({
            source: "playground",
            selectedSql: undefined,
            selectedLinesCount: undefined,
          });
        }
      });

      // Ctrl+Enter → run SQL
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => {
          const currentSQL = editor.getValue();
          const res = mockExecute(currentSQL);
          res.sql = currentSQL;
          setResult(res);
          setOutputOpen(true);
          if (currentSQL.trim()) {
            setHistory(prev => [{
              id: Date.now().toString(),
              sql: currentSQL,
              result: res,
              timestamp: new Date(),
            }, ...prev].slice(0, 50));
          }
          if (res.status === "success") {
            toast.success("Query executed successfully", { id: "sql-run" });
          } else {
            toast.error(res.message, { id: "sql-run" });
          }
        }
      );
    },
    [monacoTheme, setCopilotContext]
  );

  // ── Sync theme when site theme changes ────────────────────────────────────
  useEffect(() => {
    const monaco = monacoRef.current as any;
    if (monaco?.editor) monaco.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  // ── Preserve toolbar scroll position during sidebar transitions ─────────────────────────────────────────
  useEffect(() => {
    let scrollPosition = 0;
    const toolbar = toolbarRef.current;
    
    const preserveScroll = () => {
      if (toolbar) {
        scrollPosition = toolbar.scrollLeft;
      }
    };

    const restoreScroll = () => {
      if (toolbar) {
        toolbar.scrollLeft = scrollPosition;
      }
    };

    // Listen for layout transition start/end
    const observer = new MutationObserver(() => {
      preserveScroll();
      requestAnimationFrame(restoreScroll);
    });

    // Watch for changes that might affect layout
    if (toolbar) {
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        subtree: true
      });
    }

    // Also handle resize events
    const handleResize = () => {
      preserveScroll();
      requestAnimationFrame(restoreScroll);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // ── Load initial SQL from store (when coming from Quick Convert) ─────────────
  useEffect(() => {
    if (playgroundInitialSQL) {
      const editor = editorRef.current as any;
      if (editor) {
        editor.setValue(playgroundInitialSQL);
        setSql(playgroundInitialSQL);
      } else {
        setSql(playgroundInitialSQL);
      }
      // Clear the initial SQL after loading so it doesn't persist on subsequent visits
      setPlaygroundInitialSQL(null);
    }
  }, [playgroundInitialSQL, setPlaygroundInitialSQL]);

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const currentSQL = (editorRef.current as any)?.getValue?.() ?? sql;
        downloadText(currentSQL, "schema.sql");
        toast.success("Downloaded schema.sql");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sql]);

  // ── Close diagram dropdown on outside click ──────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        diagramBtnRef.current && diagramBtnRef.current.contains(e.target as Node)
      ) return;
      if (
        diagramDropdownRef.current && diagramDropdownRef.current.contains(e.target as Node)
      ) return;
      setDiagramDropdownOpen(false);
    };
    if (diagramDropdownOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [diagramDropdownOpen]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const runSQL = useCallback(() => {
    const currentSQL = (editorRef.current as any)?.getValue?.() ?? sql;
    const res = mockExecute(currentSQL);
    res.sql = currentSQL;
    setResult(res);
    setOutputOpen(true);
    
    // Add to history
    if (currentSQL.trim()) {
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        sql: currentSQL,
        result: res,
        timestamp: new Date(),
      };
      setHistory(prev => [entry, ...prev].slice(0, 50)); // Keep last 50 entries
    }
    
    if (res.status === "success") {
      toast.success("Query executed successfully", { id: "sql-run" });
    } else {
      toast.error(res.message, { id: "sql-run" });
    }
  }, [sql]);

  const formatSQL = useCallback(async () => {
    try {
      const { format } = await import("sql-formatter");
      const currentSQL = (editorRef.current as any)?.getValue?.() ?? sql;
      const formatted = format(currentSQL, {
        language: "sql",
        tabWidth: 2,
        keywordCase: "upper",
        linesBetweenQueries: 2,
      });
      const editor = editorRef.current as any;
      if (editor) {
        editor.executeEdits("format", [
          { range: editor.getModel().getFullModelRange(), text: formatted },
        ]);
        editor.pushUndoStop();
      } else {
        setSql(formatted);
      }
      toast.success("SQL formatted");
    } catch {
      toast.error("Could not format SQL");
    }
  }, [sql]);

  const copySQL = useCallback(async () => {
    const currentSQL = (editorRef.current as any)?.getValue?.() ?? sql;
    try {
      await navigator.clipboard.writeText(currentSQL);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copy failed");
    }
  }, [sql]);

  const downloadSQL = useCallback(() => {
    const currentSQL = (editorRef.current as any)?.getValue?.() ?? sql;
    downloadText(currentSQL, "schema.sql");
    toast.success("Downloaded schema.sql");
  }, [sql]);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    const editor = editorRef.current as any;
    if (editor) {
      editor.setValue(entry.sql);
      setSql(entry.sql);
      setResult(entry.result);
      setOutputOpen(true);
      toast.success("Loaded from history");
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    toast.success("History cleared");
  }, []);

  const extractTables = useCallback((sql: string): string[] => {
    const matches = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi) || [];
    return matches.map(m => {
      const match = m.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/i);
      return match?.[1] ?? "";
    }).filter(Boolean);
  }, []);

  // ── AI SQL Generation ─────────────────────────────────────────────────────────
  const generateSQL = useCallback(async () => {
    if (!aiPrompt.trim()) {
      toast.error("Please describe what you want to generate");
      return;
    }

    const cost = getQuestionCreditCost(aiPrompt, "generate");
    if (creditsLeft < cost) {
      toast.error(`Insufficient AI credits. Required: ${cost} credits, available: ${creditsLeft} credits.`);
      window.dispatchEvent(new CustomEvent("navigate", { detail: "pricing" }));
      return;
    }

    setAiGenerating(true);
    setAiError(null);
    setAiGeneratedSQL("");

    try {
      const currentSQL = (editorRef.current as any)?.getValue?.() ?? sql;
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "generate",
          input: aiPrompt,
          schema: currentSQL,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate SQL (${res.status})`);
      }

      const data = await res.json();
      setAiGeneratedSQL(data.sql || "");
      
      // Increment AI generation credits with cost
      incrementAIGenerations(cost);
      
      toast.success(`SQL generated successfully! (-${cost} AI credits)`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate SQL";
      setAiError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setAiGenerating(false);
    }
  }, [aiPrompt, sql, canUseAI, incrementAIGenerations]);

  const insertGeneratedSQL = useCallback(() => {
    if (!aiGeneratedSQL.trim()) return;
    
    const editor = editorRef.current as any;
    if (editor) {
      const currentSQL = editor.getValue();
      // Insert at cursor position or append at end
      const position = editor.getPosition();
      if (position) {
        editor.executeEdits("ai-insert", [
          {
            range: new (monacoRef.current as any).Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            ),
            text: aiGeneratedSQL + "\n",
          },
        ]);
      } else {
        editor.setValue(currentSQL + "\n" + aiGeneratedSQL);
      }
      setSql(editor.getValue());
      toast.success("SQL inserted into editor");
    }
  }, [aiGeneratedSQL]);

  // ── Render ────────────────────────────────────────────────────────────────
  const currentTables = extractTables(sql);

  return (
    <div
      className="flex flex-col"
      style={{
        height: "calc(100vh - 57px)",
        background: "var(--surface)",
        overflow: "hidden",
        position: "relative",
        minWidth: "320px", // Minimum width to prevent extreme compression
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        ref={toolbarRef}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2 px-3 sm:px-5 py-3 flex-shrink-0 scroll-x
          border-b border-[var(--border)] bg-[var(--card)]"
        style={{
          overflowX: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border) transparent",
          minHeight: "65px", // Ensure consistent height
          WebkitOverflowScrolling: "touch", // Better mobile scrolling
          position: "sticky", // Stick to top during transitions
          top: 0,
          zIndex: 10,
          willChange: "scroll-position", // Optimize scroll performance
        }}
      >
        {/* Title */}
        <div className="flex items-center gap-2.5 shrink-0 mr-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--primary-light)", color: "var(--primary)" }}
          >
            <Terminal size={16} />
          </div>
          <div className="flex-shrink-0">
            <h1 className="text-[15px] font-bold text-[var(--text)] leading-tight whitespace-nowrap">
              SQL Playground
            </h1>
            <p className="text-[11px] text-[var(--text-subtle)] leading-tight whitespace-nowrap hidden lg:block">
              Write and test SQL · <kbd className="font-mono">Ctrl+Enter</kbd> run ·{" "}
              <kbd className="font-mono">Ctrl+S</kbd> download
            </p>
          </div>
        </div>

        {/* Action buttons — all inline, scroll if needed */}
        <div 
          className="flex items-center gap-2"
          style={{
            minWidth: "fit-content", // Ensures buttons don't shrink below their natural width
            flexShrink: 0, // Prevents shrinking when container is small
          }}
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={runSQL}
            className="btn-primary btn-sm gap-1.5 whitespace-nowrap flex-shrink-0"
            title="Run SQL (Ctrl+Enter)"
          >
            <Play size={13} />
            <span>Run SQL</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={formatSQL}
            className="btn-ghost btn-sm gap-1.5 whitespace-nowrap flex-shrink-0"
            title="Format SQL"
          >
            <Wand2 size={13} />
            <span>Format SQL</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className={cn("btn-ghost btn-sm gap-1.5 whitespace-nowrap flex-shrink-0", aiPanelOpen && "bg-[var(--surface)]")}
            title="AI SQL Generator"
          >
            <Sparkles size={13} />
            <span>AI Generate</span>
          </motion.button>

          {/* Diagram Dropdown Button */}
          <div className="relative flex-shrink-0">
            <motion.button
              ref={diagramBtnRef}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                if (diagramBtnRef.current) {
                  const rect = diagramBtnRef.current.getBoundingClientRect();
                  setDiagramDropdownPos({
                    top: rect.bottom + 6,
                    right: window.innerWidth - rect.right,
                  });
                }
                setDiagramDropdownOpen((v) => !v);
              }}
              className={cn("btn-ghost btn-sm gap-1.5 whitespace-nowrap", diagramDropdownOpen && "bg-[var(--surface)]")}
              title="Generate Diagram"
            >
              <GitFork size={13} />
              <span>Diagram</span>
              <ChevronDown
                size={11}
                className={cn("transition-transform duration-200", diagramDropdownOpen && "rotate-180")}
              />
            </motion.button>
          </div>

          {/* Diagram Dropdown Portal — rendered at body level to escape overflow clipping */}
          {diagramDropdownOpen && diagramDropdownPos && typeof window !== "undefined" && createPortal(
            <motion.div
              ref={diagramDropdownRef}
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: diagramDropdownPos.top,
                right: diagramDropdownPos.right,
                zIndex: 9999,
                background: "var(--card)",
                border: "1px solid var(--border)",
                minWidth: 210,
              }}
              className="rounded-xl shadow-2xl overflow-hidden"
            >
              {([
                { type: "er"        as DiagramType, label: "ER Diagram",    icon: Table2,    color: "#2563EB", desc: "Tables & foreign keys"        },
                { type: "flowchart" as DiagramType, label: "Flowchart",     icon: GitFork,   color: "#059669", desc: "Schema creation flow"         },
                { type: "dfd0"      as DiagramType, label: "DFD Level 0",   icon: Share2,    color: "#D97706", desc: "System context diagram"        },
                { type: "dfd1"      as DiagramType, label: "DFD Level 1",   icon: Layers,    color: "#7C3AED", desc: "Processes & data stores"       },
                { type: "class"     as DiagramType, label: "Class Diagram", icon: GitBranch, color: "#0284C7", desc: "OOP classes & methods"         },
              ]).map(({ type, label, icon: Icon, color, desc }, i) => (
                <motion.button
                  key={type}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => {
                    setDiagramInitialTab(type);
                    setErDiagramOpen(true);
                    setDiagramDropdownOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface)]"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: color + "20", color }}
                  >
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--text)] leading-tight">{label}</p>
                    <p className="text-[10px] text-[var(--text-subtle)] leading-tight">{desc}</p>
                  </div>
                </motion.button>
              ))}
            </motion.div>,
            document.body
          )}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={copySQL}
            className="btn-ghost btn-sm gap-1.5 whitespace-nowrap flex-shrink-0"
            title="Copy SQL"
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1.5 text-[var(--success)]"
                >
                  <CheckCircle2 size={13} />
                  <span>Copied!</span>
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1.5"
                >
                  <Copy size={13} />
                  <span>Copy</span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={downloadSQL}
            className="btn-ghost btn-sm gap-1.5 whitespace-nowrap flex-shrink-0"
            title="Download schema.sql (Ctrl+S)"
          >
            <Download size={13} />
            <span>Download</span>
          </motion.button>

          <div className="w-px h-6 bg-[var(--border)] mx-1 flex-shrink-0" />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => { setHistoryOpen(!historyOpen); setTablesOpen(false); }}
            className={cn("btn-ghost btn-sm gap-1.5 whitespace-nowrap flex-shrink-0", historyOpen && "bg-[var(--surface)]")}
            title="Toggle history panel"
          >
            <History size={13} />
            <span>History</span>
            {history.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--primary)] text-white">
                {history.length}
              </span>
            )}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => { setTablesOpen(!tablesOpen); setHistoryOpen(false); }}
            className={cn("btn-ghost btn-sm gap-1.5 whitespace-nowrap flex-shrink-0", tablesOpen && "bg-[var(--surface)]")}
            title="Toggle table explorer"
          >
            <Table size={13} />
            <span>Tables</span>
            {currentTables.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--primary)] text-white">
                {currentTables.length}
              </span>
            )}
          </motion.button>
        </div>
      </motion.div>

      {/* ── Editor + Sidebars + Output ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative" style={{ minHeight: 0, minWidth: 0 }}>

        {/* ── AI SQL Generator Panel ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {aiPanelOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="border-b border-[var(--border)] bg-[var(--card)] overflow-hidden"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-[var(--primary)]" />
                  <span className="text-xs font-bold text-[var(--text)]">AI SQL Query Generator</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[10px] text-[var(--text-subtle)]">
                      {creditsLeft} / {isPro ? 150 : 50} credits left
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && generateSQL()}
                    placeholder="e.g., 'Show all students enrolled in Computer Science course'"
                    className="flex-1 px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                    disabled={aiGenerating || !canUseAI}
                  />
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={generateSQL}
                    disabled={aiGenerating || !aiPrompt.trim() || !canUseAI}
                    className="btn-primary btn-sm gap-1.5 min-w-[100px]"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Generate</span>
                      </>
                    )}
                  </motion.button>
                </div>

                {!isPro && creditsLeft <= 10 && creditsLeft > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20"
                  >
                    <Zap size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        {creditsLeft} AI credits remaining
                      </p>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                        Upgrade to Pro for unlimited AI SQL generation
                      </p>
                    </div>
                  </motion.div>
                )}

                {!isPro && creditsLeft === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
                  >
                    <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                        No AI credits remaining
                      </p>
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent("navigate", { detail: "pricing" }))}
                        className="text-[10px] text-red-600 dark:text-red-500 mt-0.5 underline hover:no-underline"
                      >
                        Upgrade to Pro for unlimited access →
                      </button>
                    </div>
                  </motion.div>
                )}

                {aiError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20"
                  >
                    <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-600 dark:text-red-400">{aiError}</p>
                  </motion.div>
                )}

                {aiGeneratedSQL && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider">
                        Generated SQL
                      </span>
                      <div className="flex items-center gap-1">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={insertGeneratedSQL}
                          className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--primary)] text-white hover:opacity-90 transition-opacity"
                        >
                          Insert to Editor
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            navigator.clipboard.writeText(aiGeneratedSQL);
                            toast.success("SQL copied to clipboard");
                          }}
                          className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
                        >
                          Copy
                        </motion.button>
                      </div>
                    </div>
                    <div className="rounded-lg p-3 bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
                      <pre className="text-xs font-mono text-[var(--text)] whitespace-pre-wrap">
                        {aiGeneratedSQL}
                      </pre>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Monaco Editor area — always full width ───────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="flex-1 flex flex-col overflow-hidden min-w-0"
        >
          {/* VS Code–style tab bar */}
          <div
            className="flex items-center gap-2 px-3 sm:px-4 py-1.5 flex-shrink-0
              border-b border-[var(--border)]"
            style={{ background: "var(--card)" }}
          >
            {/* Traffic lights */}
            <div className="flex items-center gap-1.5 mr-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
            </div>

            {/* Active file tab */}
            <div
              className="flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-[11px]
                font-mono text-[var(--text-muted)] border border-[var(--border)]"
              style={{ background: "var(--surface)" }}
            >
              <Code2 size={10} className="text-[var(--primary)]" />
              <span className="hidden sm:inline">schema.sql</span>
              <span className="sm:hidden">schema</span>
            </div>

            {/* Right meta */}
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <span className="text-[10px] text-[var(--text-subtle)] items-center gap-1 hidden sm:inline-flex">
                <Database size={10} />
                DDL Mode
              </span>
              <span className="text-[10px] text-[var(--text-subtle)] items-center gap-1 hidden md:inline-flex">
                <Zap size={10} />
                Mock Engine
              </span>
            </div>
          </div>

          {/* Monaco */}
          <div className="flex-1" style={{ minHeight: 0 }}>
            <MonacoEditor
              height="100%"
              language="sql"
              value={sql}
              theme={monacoTheme}
              beforeMount={handleEditorWillMount}
              onMount={handleEditorDidMount}
              onChange={(v) => setSql(v ?? "")}
              options={{
                fontSize: 13.5,
                fontFamily: "'JetBrains Mono', Consolas, 'Courier New', monospace",
                fontLigatures: true,
                lineNumbers: "on",
                lineNumbersMinChars: 3,
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                insertSpaces: true,
                renderLineHighlight: "line",
                cursorBlinking: "smooth",
                cursorSmoothCaretAnimation: "on",
                smoothScrolling: true,
                padding: { top: 16, bottom: 16 },
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                  vertical: "auto",
                  horizontal: "auto",
                },
                overviewRulerLanes: 0,
                folding: true,
                bracketPairColorization: { enabled: true },
                suggest: { showKeywords: true },
                quickSuggestions: true,
                contextmenu: true,
                renderWhitespace: "selection",
                guides: { indentation: true },
              }}
            />
          </div>

          {/* ── Output Panel ─────────────────────────────────────────────────── */}
          <OutputPanel
            result={result}
            outputOpen={outputOpen}
            onToggle={() => setOutputOpen((v) => !v)}
          />
        </motion.div>

      {/* ── History Panel — overlay, slides in from right ─────────────────── */}
      <AnimatePresence>
        {historyOpen && (
          <motion.div
            key="history-panel"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0 right-0 bottom-0 flex flex-col overflow-hidden z-20 shadow-2xl"
            style={{ width: 300, background: "var(--card)", borderLeft: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <History size={14} className="text-[var(--text-muted)]" />
                <span className="text-xs font-bold text-[var(--text)]">Execution History</span>
              </div>
              <div className="flex items-center gap-1">
                {history.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={clearHistory}
                    className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Clear history"
                  >
                    <RotateCcw size={12} />
                  </motion.button>
                )}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setHistoryOpen(false)}
                  className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
                >
                  <X size={14} />
                </motion.button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                  <Clock size={24} className="text-[var(--text-subtle)]" />
                  <p className="text-xs text-[var(--text-muted)]">No execution history yet</p>
                  <p className="text-[10px] text-[var(--text-subtle)]">Run queries to see them here</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {history.map((entry, idx) => (
                    <motion.button
                      key={entry.id}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03, duration: 0.15 }}
                      whileHover={{ backgroundColor: "var(--surface)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => loadFromHistory(entry)}
                      className="w-full p-3 text-left transition-colors"
                    >
                      <div className="flex items-start gap-2 mb-1.5">
                        {entry.result.status === "success" ? (
                          <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={12} className="text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-[var(--text)] truncate">
                            {entry.result.status === "success" ? "Success" : "Error"}
                          </p>
                          <p className="text-[10px] text-[var(--text-subtle)] mt-0.5">
                            {entry.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono line-clamp-2 pl-5">
                        {entry.sql.split("\n").find(l => l.trim() && !l.trim().startsWith("--"))?.substring(0, 60) ?? entry.sql.substring(0, 60)}
                      </p>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Table Explorer Panel — overlay, slides in from right ────────────── */}
      <AnimatePresence>
        {tablesOpen && (
          <motion.div
            key="tables-panel"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0 right-0 bottom-0 flex flex-col overflow-hidden z-20 shadow-2xl"
            style={{ width: 280, background: "var(--card)", borderLeft: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Table size={14} className="text-[var(--text-muted)]" />
                <span className="text-xs font-bold text-[var(--text)]">Table Explorer</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setTablesOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
              >
                <X size={14} />
              </motion.button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3">
              {currentTables.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                  <Database size={24} className="text-[var(--text-subtle)]" />
                  <p className="text-xs text-[var(--text-muted)]">No tables detected</p>
                  <p className="text-[10px] text-[var(--text-subtle)]">Write CREATE TABLE to see them here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    const parsed = parseSQLSchema(sql);
                    return parsed.tables.map((table, idx) => (
                      <motion.div
                        key={table.name}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.18 }}
                        className="rounded-lg border border-[var(--border)] overflow-hidden"
                        style={{ background: "var(--surface)" }}
                      >
                        {/* Table header */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)]"
                          style={{ background: "var(--card)" }}>
                          <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                            style={{ background: "var(--primary-light)" }}>
                            <Table size={10} style={{ color: "var(--primary)" }} />
                          </div>
                          <span className="text-[11px] font-bold text-[var(--text)] truncate flex-1">{table.name}</span>
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--border)] text-[var(--text-muted)]">
                            {table.columns.length} cols
                          </span>
                        </div>
                        {/* Columns */}
                        <div className="divide-y divide-[var(--border)]">
                          {table.columns.map((col) => (
                            <div key={col.name} className="flex items-center gap-2 px-3 py-1.5">
                              <div className="w-[30px] flex-shrink-0">
                                {col.isPrimaryKey && col.isForeignKey && (
                                  <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700">PK/FK</span>
                                )}
                                {col.isPrimaryKey && !col.isForeignKey && (
                                  <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700">PK</span>
                                )}
                                {col.isForeignKey && !col.isPrimaryKey && (
                                  <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-100 text-blue-700">FK</span>
                                )}
                              </div>
                              <span className="text-[10px] font-medium text-[var(--text)] truncate flex-1">{col.name}</span>
                              <span className="text-[9px] font-mono text-[var(--text-subtle)] flex-shrink-0">{col.type}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* ER Diagram Modal */}
      <ERDiagramModal
        sql={sql}
        isOpen={erDiagramOpen}
        onClose={() => setErDiagramOpen(false)}
        theme={theme}
        initialTab={diagramInitialTab}
      />
    </div>
  );
}

// ── Output Panel Component ────────────────────────────────────────────────────
interface OutputPanelProps {
  result: ExecutionResult;
  outputOpen: boolean;
  onToggle: () => void;
}

function OutputPanel({ result, outputOpen, onToggle }: OutputPanelProps) {
  const collapsedH = "42px";
  const expandedH  = "180px";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.3 }}
      className="border-t border-[var(--border)] flex-shrink-0 flex flex-col overflow-hidden"
      style={{
        background: "var(--card)",
        height: outputOpen ? expandedH : collapsedH,
        transition: "height 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 flex-shrink-0
          text-left hover:bg-[var(--surface)] transition-colors duration-150 group"
        style={{ height: collapsedH }}
        aria-expanded={outputOpen}
        aria-controls="output-panel-body"
      >
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-[var(--text-subtle)]" />
          <span className="text-[11px] font-bold text-[var(--text-muted)] tracking-widest uppercase">
            Output
          </span>

          {/* Status badge */}
          {result.status !== "idle" && (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                result.status === "success"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                  : "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
              )}
            >
              {result.status === "success" ? (
                <CheckCircle2 size={9} />
              ) : (
                <XCircle size={9} />
              )}
              {result.status === "success" ? "Success" : "Error"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {result.duration != null && result.status !== "idle" && (
            <span className="text-[10px] text-[var(--text-subtle)] flex items-center gap-1">
              <Clock size={9} />
              {result.duration}ms
            </span>
          )}
          <span className="text-[var(--text-subtle)] group-hover:text-[var(--text-muted)] transition-colors">
            {outputOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </span>
        </div>
      </button>

      {/* Body */}
      <div
        id="output-panel-body"
        className="flex-1 overflow-y-auto px-4 pb-3"
      >
        <AnimatePresence mode="wait">
          {outputOpen && (
            <motion.div
              key={result.status + (result.message ?? "")}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {result.status === "idle"    && <IdleOutput />}
              {result.status === "success" && <SuccessOutput result={result} />}
              {result.status === "error"   && <ErrorOutput result={result} />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Output state components ───────────────────────────────────────────────────

function IdleOutput() {
  return (
    <div className="flex items-center gap-2 mt-1">
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-subtle)] flex-shrink-0" />
      <p className="text-[12px] text-[var(--text-subtle)] font-mono">
        Run a query to see results here.
      </p>
    </div>
  );
}

function SuccessOutput({ result }: { result: ExecutionResult }) {
  return (
    <div
      className="rounded-xl p-3.5 border"
      style={{
        background: "rgba(16,185,129,0.06)",
        borderColor: "rgba(16,185,129,0.22)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <CheckCircle2
          size={15}
          className="text-emerald-500 flex-shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 leading-snug">
            ✓ {result.message}
          </p>
          {result.detail && (
            <p className="text-[12px] text-emerald-600 dark:text-emerald-500 mt-1 font-mono leading-relaxed">
              {result.detail}
            </p>
          )}
          {result.executedAt && (
            <p className="text-[10px] text-[var(--text-subtle)] mt-2 flex items-center gap-1.5">
              <Clock size={9} />
              {result.executedAt.toLocaleTimeString()} · {result.duration}ms
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorOutput({ result }: { result: ExecutionResult }) {
  return (
    <div
      className="rounded-xl p-3.5 border"
      style={{
        background: "rgba(220,38,38,0.06)",
        borderColor: "rgba(220,38,38,0.22)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <XCircle
          size={15}
          className="text-red-500 flex-shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-red-600 dark:text-red-400 leading-snug">
            ❌ {result.message}
          </p>
          {result.detail && (
            <p className="text-[12px] text-red-500/85 dark:text-red-400/80 mt-1 font-mono leading-relaxed">
              {result.detail}
            </p>
          )}
          {result.executedAt && (
            <p className="text-[10px] text-[var(--text-subtle)] mt-2 flex items-center gap-1.5">
              <Clock size={9} />
              {result.executedAt.toLocaleTimeString()} · {result.duration}ms
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
