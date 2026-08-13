"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2, Database, Table2, GitBranch, Timer,
  Copy, Download, RefreshCw, CheckCircle,
  AlertTriangle, ArrowRight, FileText, FileJson,
  Sparkles, ChevronDown, ChevronUp, Lightbulb,
  FolderOpen, Plus, X, Save, GitFork, Share2, Layers, Terminal,
  Loader2, XCircle, Zap,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { parseSQLStats, downloadText, downloadJSON, genId, formatTime, cn } from "@/lib/utils";
import { canConvert, conversionsLeft, canCreateProject, canGenerateAI, aiGenerationsLeft, getQuestionCreditCost } from "@/lib/subscription";
import type { Project, DBType } from "@/lib/types";
import UpgradeLimitDialog from "@/components/UpgradeLimitDialog";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="skeleton h-4" style={{ width: `${35 + Math.random() * 55}%` }} />
        ))}
      </div>
    ),
  }
);

const DIAGRAM_TYPES = [
  {
    value: "er",
    label: "ER Diagram",
    icon: Table2,
    desc: "Entity-relationship diagram with tables & foreign keys",
    color: "text-[var(--text)]",
    bg: "bg-[var(--card)]",
    border: "border-[var(--text-subtle)]",
  },
  {
    value: "flowchart",
    label: "Flowchart",
    icon: GitFork,
    desc: "Process flow with decisions and steps",
    color: "text-[var(--text)]",
    bg: "bg-[var(--card)]",
    border: "border-[var(--text-subtle)]",
  },
  {
    value: "dfd0",
    label: "DFD Level 0",
    icon: Share2,
    desc: "Context diagram — system vs external entities",
    color: "text-[var(--text)]",
    bg: "bg-[var(--card)]",
    border: "border-[var(--text-subtle)]",
  },
  {
    value: "dfd1",
    label: "DFD Level 1",
    icon: Layers,
    desc: "Decomposed processes, data stores & flows",
    color: "text-[var(--text)]",
    bg: "bg-[var(--card)]",
    border: "border-[var(--text-subtle)]",
  },
  {
    value: "class",
    label: "Class Diagram",
    icon: GitBranch,
    desc: "OOP classes with attributes, methods & relationships",
    color: "text-[var(--text)]",
    bg: "bg-[var(--card)]",
    border: "border-[var(--text-subtle)]",
  },
];

const DB_OPTIONS = [
  { value: "postgresql", label: "PostgreSQL", short: "PG",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "mysql",      label: "MySQL",      short: "MY",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "sqlite",     label: "SQLite",     short: "SL",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "mssql",      label: "SQL Server", short: "SS",  color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
  { value: "oracle",     label: "Oracle",     short: "ORA", color: "text-[var(--text)]", border: "border-[var(--text-subtle)]", bg: "bg-[var(--card)]" },
];

const EXAMPLE_PROMPTS = [
  "A university database with students, courses, professors, enrollments, and departments",
  "An e-commerce platform with customers, products, orders, order items, categories, and reviews",
  "A hospital system with patients, doctors, appointments, prescriptions, and wards",
  "A social media app with users, posts, comments, likes, followers, and hashtags",
  "A library management system with books, members, authors, loans, and reservations",
  "A hotel booking system with hotels, rooms, guests, bookings, and payments",
];

const PROCESS_STEPS = [
  "Analyzing description…",
  "Designing entities…",
  "Mapping relationships…",
  "Generating diagram…",
  "Writing SQL DDL…",
];

interface GenerateResult {
  id: string;
  description: string;
  mermaid: string;
  sql: string;
  tables: string[];
  dialect: string;
  timestamp: number;
  processingTime: number;
  stats: { tables: number; relationships: number; attributes: number };
}

export default function GeneratePage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { getSubscription, incrementConversions, incrementAIGenerations, theme, user, projects, upsertProject, upsertFile, setActiveProject, setPlaygroundInitialSQL } = useStore();
  const sub = getSubscription();
  const ownerId = user?.id ?? "";
  const myProjects = projects.filter(p => p.ownerId === ownerId);
  const canUseAI = canGenerateAI(sub);
  const aiCreditsLeft = aiGenerationsLeft(sub);

  const [description, setDescription]   = useState("");
  const [selectedDb, setSelectedDb]     = useState("postgresql");
  const [diagramType, setDiagramType]   = useState("er");
  const [status, setStatus]             = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult]             = useState<GenerateResult | null>(null);
  const [error, setError]               = useState("");
  const [step, setStep]                 = useState(0);
  const [limitOpen, setLimitOpen]       = useState(false);
  const [activeTab, setActiveTab]       = useState<"diagram" | "sql">("diagram");
  const [showExamples, setShowExamples] = useState(false);
  const [mermaidSvg, setMermaidSvg]     = useState<string>("");
  const [mermaidError, setMermaidError] = useState(false);
  const diagramRef = useRef<HTMLDivElement>(null);

  // Save-to-project modal state
  const [saveOpen, setSaveOpen]         = useState(false);
  const [saveMode, setSaveMode]         = useState<"existing" | "new">("existing");
  const [saveProjectId, setSaveProjectId] = useState<string>("");
  const [newProjectName, setNewProjectName] = useState("");
  const [saving, setSaving]             = useState(false);

  // AI SQL Generator state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedSQL, setAiGeneratedSQL] = useState("");
  const [aiError, setAiError] = useState<string | null>(null);

  const activeDb = DB_OPTIONS.find((d) => d.value === selectedDb) ?? DB_OPTIONS[0];
  const left = conversionsLeft(sub);

  // ── Sanitize Mermaid syntax before rendering ──────────────────────────────
  function sanitizeMermaid(raw: string): string {
    let s = raw.trim();
    const lower = s.toLowerCase();

    // ── DFD (Level 0 / Level 1) — convert to flowchart ───────────────────
    // Mermaid has no native DFD support; AI often generates custom syntax.
    // We normalise it into a valid flowchart LR.
    if (lower.startsWith("dfd") || lower.startsWith("graph dfd") || lower.includes("dataflow")) {
      // Strip any non-flowchart header line
      const lines = s.split("\n").filter(l => l.trim());
      const bodyLines = lines.filter(l =>
        !l.trim().toLowerCase().startsWith("dfd") &&
        !l.trim().toLowerCase().startsWith("dataflow")
      );
      // Normalise arrows
      let body = bodyLines.join("\n")
        .replace(/—>/g, "-->").replace(/→/g, "-->").replace(/=>/g, "-->")
        .replace(/\[([^\]]*):([^\]]*)\]/g, (_, a, b) => `[${a.trim()} ${b.trim()}]`)
        .replace(/\(([^)]*):([^)]*)\)/g, (_, a, b) => `(${a.trim()} ${b.trim()})`);
      return `flowchart LR\n${body}`;
    }

    // ── Class diagram fixes ───────────────────────────────────────────────
    if (lower.startsWith("classdiagram") || lower.startsWith("class diagram")) {
      s = s.replace(/^class\s*diagram/im, "classDiagram");
      return s.split("\n").filter(l => l.trim()).join("\n");
    }

    // ── Flowchart-specific fixes ───────────────────────────────────────────
    if (!lower.startsWith("erdiagram")) {
      s = s.replace(/^Flowchart\s/im, "flowchart ");
      s = s.replace(/—>/g, "-->").replace(/→/g, "-->").replace(/=>/g, "-->");
      s = s.replace(/-->\s*\|/g, "-->|");
      s = s.replace(/\[([^\]]*):([^\]]*)\]/g, (_, a, b) => `[${a.trim()} ${b.trim()}]`);
      s = s.replace(/\(([^)]*):([^)]*)\)/g, (_, a, b) => `(${a.trim()} ${b.trim()})`);
      return s.split("\n").filter(l => l.trim()).join("\n");
    }

    // ── ER Diagram fixes ───────────────────────────────────────────────────

    // 1. Normalize keyword
    s = s.replace(/^er[_\-\s]?diagram/im, "erDiagram");

    // 2. Map SQL types → Mermaid-safe types
    const typeMap: Record<string, string> = {
      "VARCHAR\\(\\d+\\)": "string",
      "NVARCHAR\\(\\d+\\)": "string",
      "VARCHAR2\\(\\d+\\)": "string",
      "CHAR\\(\\d+\\)": "string",
      "VARCHAR": "string",
      "NVARCHAR": "string",
      "VARCHAR2": "string",
      "TEXT": "string",
      "CLOB": "string",
      "LONGTEXT": "string",
      "MEDIUMTEXT": "string",
      "SERIAL": "int",
      "BIGINT": "int",
      "SMALLINT": "int",
      "INTEGER": "int",
      "TINYINT\\(\\d+\\)": "int",
      "TINYINT": "int",
      "NUMERIC\\(\\d+,\\s*\\d+\\)": "float",
      "NUMERIC": "float",
      "DECIMAL\\(\\d+,\\s*\\d+\\)": "float",
      "DECIMAL": "float",
      "DOUBLE PRECISION": "float",
      "DOUBLE": "float",
      "REAL": "float",
      "NUMBER\\(\\d+,\\s*\\d+\\)": "float",
      "NUMBER": "int",
      "DATETIME2": "datetime",
      "DATETIME": "datetime",
      "TIMESTAMP": "datetime",
      "TIMESTAMPTZ": "datetime",
      "DATE": "date",
      "TIME": "string",
      "BOOLEAN": "boolean",
      "BOOL": "boolean",
      "BIT": "boolean",
      "BYTEA": "string",
      "BLOB": "string",
      "JSON": "string",
      "JSONB": "string",
      "UUID": "string",
    };

    for (const [pattern, replacement] of Object.entries(typeMap)) {
      s = s.replace(new RegExp(`\\b${pattern}\\b`, "gi"), replacement);
    }

    // 3. Fix relationship labels — multi-word → single word (no spaces)
    s = s.replace(/:\s*"([^"]+)"/g, (_, label) => {
      const safe = label.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      return `: "${safe || "has"}"`;
    });
    // Also fix unquoted labels
    s = s.replace(/:\s+([a-zA-Z][a-zA-Z0-9 ]+)$/gm, (_, label) => {
      const safe = label.trim().replace(/\s+/g, "_");
      return `: "${safe}"`;
    });

    // 4. Remove UK marker (not always supported) — keep PK and FK only
    s = s.replace(/\bUK\b/g, "");

    // 5. Remove comments inside mermaid block
    s = s.replace(/^\s*--.*$/gm, "");

    // 6. Remove blank lines
    s = s.split("\n").filter(l => l.trim() !== "").join("\n");

    return s;
  }

  // ── Render Mermaid diagram ──────────────────────────────────────────────────
  useEffect(() => {
    if (!result?.mermaid) return;
    let cancelled = false;
    setMermaidError(false);
    setMermaidSvg("");

    const cleaned = sanitizeMermaid(result.mermaid);

    import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === "dark" ? "dark" : "default",
        er: { diagramPadding: 20, layoutDirection: "TB", minEntityWidth: 100 },
        flowchart: { curve: "basis", padding: 20, htmlLabels: true },
        securityLevel: "loose",
      });
      const id = `mermaid-${genId()}`;
      mermaid.render(id, cleaned)
        .then(({ svg }) => {
          if (!cancelled) setMermaidSvg(svg);
        })
        .catch((err) => {
          console.warn("Mermaid render failed:", err?.message ?? err);
          console.warn("Cleaned mermaid input:\n", cleaned);
          if (!cancelled) setMermaidError(true);
        });
    });
    return () => { cancelled = true; };
  }, [result?.mermaid, theme]);

  // ── Step animation ──────────────────────────────────────────────────────────
  const runStepAnimation = useCallback(() => {
    let s = 0;
    setStep(0);
    const id = setInterval(() => {
      s = Math.min(s + 1, PROCESS_STEPS.length - 1);
      setStep(s);
    }, 1400);
    return () => clearInterval(id);
  }, []);

  // ── Generate ────────────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    if (!description.trim()) { toast.error("Please enter a description first"); return; }
    if (!canConvert(sub)) { setLimitOpen(true); return; }

    setStatus("processing");
    setError("");
    setResult(null);
    setMermaidSvg("");
    const stopAnim = runStepAnimation();

    try {
      const t0 = Date.now();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), dialect: selectedDb, diagramType }),
      });
      const data = await res.json();
      stopAnim();

      if (!res.ok || !data.sql || !data.mermaid) throw new Error(data.error || "Generation failed");

      const { tables, fks, cols } = parseSQLStats(data.sql);
      const generated: GenerateResult = {
        id: genId(),
        description: description.trim(),
        mermaid: data.mermaid,
        sql: data.sql,
        tables: data.tables ?? [],
        dialect: selectedDb,
        timestamp: Date.now(),
        processingTime: Date.now() - t0,
        stats: { tables, relationships: fks, attributes: cols },
      };
      setResult(generated);
      setStatus("done");
      setActiveTab("diagram");
      incrementConversions();
      // ── Save to tool history ──
      const numericId = parseInt(user?.id ?? "", 10);
      if (!isNaN(numericId)) {
        const { apiSaveToolHistory, apiSaveConversion } = await import("@/lib/api");
        apiSaveToolHistory({
          user_id: numericId,
          tool: "generate",
          action_label: `"${description.trim().slice(0, 60)}" → ${selectedDb.toUpperCase()}`,
          result_sql: data.sql,
          dialect_from: "text",
          dialect_to: selectedDb,
          tables_count: tables,
          processing_time_ms: generated.processingTime,
          success: true,
          extra_json: { diagramType, relationships: fks, description: description.trim().slice(0, 200) },
        }).catch(() => {});
        // ── Save to conversions table in DB ──
        apiSaveConversion({
          user_id: numericId,
          generated_ddl: data.sql,
          dialect: selectedDb,
          success: true,
          tables_count: tables,
          relationships_count: fks,
          execution_time_ms: generated.processingTime,
          tool: "generate",
        }).catch(() => {});
      }
      toast.success("Schema generated!");
    } catch (err: any) {
      stopAnim();
      setError(err.message || "Generation failed");
      setStatus("error");
      toast.error(err.message || "Generation failed");
    }
  }, [description, selectedDb, diagramType, sub, runStepAnimation, incrementConversions, user]);

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setError("");
    setStep(0);
    setMermaidSvg("");
  };

  const baseName = result
    ? result.description.slice(0, 30).trim().replace(/\s+/g, "_").toLowerCase()
    : "schema";

  // ── Save to Project ─────────────────────────────────────────────────────────
  const openSaveModal = () => {
    if (myProjects.length > 0) {
      setSaveMode("existing");
      setSaveProjectId(myProjects[0].id);
    } else {
      setSaveMode("new");
    }
    setNewProjectName(result ? result.description.slice(0, 40).trim() : "");
    setSaveOpen(true);
  };

  const confirmSave = async () => {
    if (!result) return;
    setSaving(true);

    const numericUserId = parseInt(user?.id ?? "", 10);
    let targetProjectId = saveProjectId;

    // Create new project if needed
    if (saveMode === "new") {
      if (!newProjectName.trim()) { toast.error("Enter a project name"); setSaving(false); return; }
      if (!canCreateProject(sub, myProjects.length)) { toast.error("Project limit reached. Upgrade to Pro."); setSaving(false); return; }
      const newProject: Project = {
        id: genId(), ownerId,
        name: newProjectName.trim(),
        description: result.description,
        dbType: result.dialect as DBType,
        createdAt: Date.now(), updatedAt: Date.now(),
        files: [],
      };
      upsertProject(newProject);
      targetProjectId = newProject.id;
      // Save new project to DB
      if (!isNaN(numericUserId)) {
        try {
          const { apiSaveProject } = await import("@/lib/api");
          await apiSaveProject({ user_id: numericUserId, id: newProject.id, name: newProject.name, description: newProject.description, db_type: newProject.dbType, files: [], pinned: false });
        } catch { /* non-fatal */ }
      }
    }

    // Add as a completed file
    const fileName = `${baseName}.sql`;
    const newFile = {
      id: genId(),
      name: fileName,
      imageUrl: "",
      status: "completed" as const,
      sql: result.sql,
      uploadedAt: Date.now(),
      completedAt: Date.now(),
      processingTime: result.processingTime,
      stats: result.stats,
    };
    upsertFile(targetProjectId, ownerId, newFile);

    // Sync updated project (with new file) to DB
    if (!isNaN(numericUserId)) {
      try {
        const { apiSaveProject } = await import("@/lib/api");
        const latestProject = useStore.getState().projects.find(p => p.id === targetProjectId);
        if (latestProject) {
          await apiSaveProject({ user_id: numericUserId, id: latestProject.id, name: latestProject.name, description: latestProject.description, db_type: latestProject.dbType, files: latestProject.files, pinned: latestProject.pinned ?? false });
        }
      } catch { /* non-fatal */ }
    }

    setSaving(false);
    setSaveOpen(false);
    toast.success("Saved to project!");
    setActiveProject(targetProjectId);
    onNavigate("project-detail");
  };

  // ── AI SQL Generation ─────────────────────────────────────────────────────────
  const generateAISQL = useCallback(async () => {
    if (!aiPrompt.trim()) {
      toast.error("Please describe what you want to generate");
      return;
    }

    const cost = getQuestionCreditCost(aiPrompt, "generate");
    if (aiCreditsLeft < cost) {
      toast.error(`Insufficient AI credits. Required: ${cost} credits, available: ${aiCreditsLeft} credits.`);
      window.dispatchEvent(new CustomEvent("navigate", { detail: "pricing" }));
      return;
    }

    setAiGenerating(true);
    setAiError(null);
    setAiGeneratedSQL("");

    try {
      const currentSQL = result?.sql || "";
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
      
      // Increment AI generation credits with cost amount
      incrementAIGenerations(cost);
      
      toast.success(`SQL generated successfully! (-${cost} AI credits)`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate SQL";
      setAiError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setAiGenerating(false);
    }
  }, [aiPrompt, result?.sql, canUseAI, incrementAIGenerations]);

  return (
    <div className="w-full px-1">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Wand2 size={22} className="text-primary-600" />
            <h1 className="text-3xl font-bold text-[var(--text)]">Generate Schema</h1>
            <span className="badge badge-emerald text-xs px-2.5 py-1">AI Powered</span>
          </div>
          <p className="text-base text-[var(--text-muted)]">
            Describe your database in plain English and get an ER diagram + SQL instantly.&nbsp;
            <span className="font-semibold text-[var(--text)]">{left} conversion{left !== 1 ? "s" : ""}</span>
            &nbsp;remaining this month.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0 transition-all",
              aiPanelOpen ? "bg-[var(--primary)] text-white" : "bg-[var(--card)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface)]"
            )}
          >
            <Sparkles size={14} />
            <span>AI SQL</span>
          </button>
          {sub.planId !== "pro" && (
            <button
              onClick={() => onNavigate("pricing")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0
                bg-gradient-to-r from-primary-600 to-primary-700 text-white
                hover:shadow-lg hover:shadow-primary-500/25 transition-all"
            >
              Upgrade to Pro <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Diagram Type Selector ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={17} className="text-[var(--text-muted)]" />
          <span className="text-base font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Diagram Type
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {DIAGRAM_TYPES.map((dt) => {
            const Icon = dt.icon;
            const active = diagramType === dt.value;
            return (
              <button
                key={dt.value}
                onClick={() => setDiagramType(dt.value)}
                className={cn(
                  "flex flex-col items-start gap-1.5 px-3.5 py-3 rounded-xl border-2 text-left transition-all",
                  active
                    ? `${dt.bg} ${dt.color} ${dt.border} shadow-sm`
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-subtle)] hover:bg-[var(--surface)]"
                )}
              >
                <Icon size={18} className={active ? dt.color : "text-[var(--text-subtle)]"} />
                <span className="text-sm font-bold leading-tight">{dt.label}</span>
                <span className="text-xs leading-tight opacity-70 hidden sm:block">{dt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── AI SQL Generator Panel ── */}
      <AnimatePresence>
        {aiPanelOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="mb-6 border border-[var(--border)] rounded-xl bg-[var(--card)] overflow-hidden"
          >
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-[var(--primary)]" />
                <span className="text-xs font-bold text-[var(--text)]">AI SQL Query Generator</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {sub.planId === "pro" ? (
                    <span className="text-[10px] text-[var(--primary)] font-medium">
                      Unlimited
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--text-subtle)]">
                      {aiCreditsLeft} credits left
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && generateAISQL()}
                  placeholder="e.g., 'Show all students enrolled in Computer Science course'"
                  className="flex-1 px-3 py-2 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)]"
                  disabled={aiGenerating || !canUseAI}
                />
                <button
                  onClick={generateAISQL}
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
                </button>
              </div>

              {sub.planId !== "pro" && aiCreditsLeft <= 10 && aiCreditsLeft > 0 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                  <Zap size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                      {aiCreditsLeft} AI credits remaining
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                      Upgrade to Pro for unlimited AI SQL generation
                    </p>
                  </div>
                </div>
              )}

              {sub.planId !== "pro" && aiCreditsLeft === 0 && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                  <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                      No AI credits remaining
                    </p>
                    <button
                      onClick={() => onNavigate("pricing")}
                      className="text-[10px] text-red-600 dark:text-red-500 mt-0.5 underline hover:no-underline"
                    >
                      Upgrade to Pro for unlimited access →
                    </button>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                  <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 dark:text-red-400">{aiError}</p>
                </div>
              )}

              {aiGeneratedSQL && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-[var(--text-subtle)] uppercase tracking-wider">
                      Generated SQL
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(aiGeneratedSQL);
                          toast.success("SQL copied to clipboard");
                        }}
                        className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--border)] transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg p-3 bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
                    <pre className="text-xs font-mono text-[var(--text)] whitespace-pre-wrap">
                      {aiGeneratedSQL}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Database Selector ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Database size={17} className="text-[var(--text-muted)]" />
          <span className="text-base font-semibold text-[var(--text-muted)] uppercase tracking-widest">
            Target Database
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-3">
          {DB_OPTIONS.map((db) => (
            <button
              key={db.value}
              onClick={() => setSelectedDb(db.value)}
              className={cn(
                "flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-base font-semibold border-2 transition-all",
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

      {/* ── Input Area ── */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="text-base font-bold text-[var(--text)]">Describe your database</label>
          <button
            onClick={() => setShowExamples(!showExamples)}
            className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] font-medium hover:text-[var(--text)] transition-colors"
          >
            <Lightbulb size={15} />
            Examples
            {showExamples ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        <AnimatePresence>
          {showExamples && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
              className="overflow-hidden mb-3"
            >
              <div className="flex flex-wrap gap-2 pb-1">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setDescription(ex); setShowExamples(false); }}
                    className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)]
                      bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--text-subtle)]
                      hover:text-[var(--text)] hover:bg-[var(--card)]
                      transition-all text-left"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={status === "processing"}
          placeholder="e.g. A university database with students, courses, professors, enrollments, and departments. Students can enroll in multiple courses. Each course is taught by one professor who belongs to a department."
          rows={4}
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)]
            text-[var(--text)] placeholder:text-[var(--text-subtle)] text-base px-4 py-3
            focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500
            transition-all disabled:opacity-50"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm text-[var(--text-subtle)]">
            {description.length} / 2000 characters
          </span>
          <div className="flex items-center gap-2">
            {status === "done" && (
              <button onClick={reset} className="btn-ghost text-sm px-4 py-2">
                <RefreshCw size={13} /> Reset
              </button>
            )}
            <button
              onClick={generate}
              disabled={status === "processing" || !description.trim() || !canConvert(sub)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold
                bg-gradient-to-r from-primary-600 to-primary-700 text-white
                hover:shadow-lg hover:shadow-primary-500/25 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {status === "processing" ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Processing ── */}
      <AnimatePresence mode="wait">
        {status === "processing" && (
          <motion.div key="processing"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="card p-16 flex flex-col items-center gap-8"
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
                <motion.p key={step}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="text-xl font-bold text-[var(--text)] mb-2"
                >
                  {PROCESS_STEPS[step]}
                </motion.p>
              </AnimatePresence>
              <p className="text-sm text-[var(--text-muted)] max-w-xs line-clamp-2">"{description}"</p>
              <p className="text-sm text-[var(--text-subtle)] mt-1">
                Generating <span className={cn("font-semibold", activeDb.color)}>{activeDb.label}</span> schema
                {" · "}<span className="font-semibold text-[var(--text-muted)]">
                  {DIAGRAM_TYPES.find(d => d.value === diagramType)?.label ?? "ER Diagram"}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {PROCESS_STEPS.map((_, i) => (
                <div key={i} className={cn(
                  "rounded-full transition-all duration-300",
                  i <= step ? "w-3 h-3 bg-primary-500" : "w-2.5 h-2.5 bg-[var(--border)]"
                )} />
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Error ── */}
        {status === "error" && (
          <motion.div key="error"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="card p-16 flex flex-col items-center gap-5 text-center"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={28} className="text-red-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text)] mb-2">Generation Failed</p>
              <p className="text-base text-[var(--text-muted)] max-w-sm">{error}</p>
            </div>
            <button onClick={reset} className="btn-primary text-sm px-6 py-2.5">
              <RefreshCw size={15} /> Try Again
            </button>
          </motion.div>
        )}

        {/* ── Result ── */}
        {status === "done" && result && (
          <motion.div key="done"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="space-y-5"
          >
            {/* Summary card */}
            <div className="card p-5">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" />
                    <p className="text-base font-bold text-[var(--text)] truncate">
                      Schema generated successfully
                    </p>
                  </div>
                  <p className="text-sm text-[var(--text-muted)] line-clamp-2 mt-1">"{result.description}"</p>
                  <div className="flex items-center flex-wrap gap-2 mt-3">
                    <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-3 py-1 rounded-lg border border-[var(--border)]">
                      <Table2 size={13} />
                      {result.stats.tables} tables
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-3 py-1 rounded-lg border border-[var(--border)]">
                      <GitBranch size={13} />
                      {result.stats.relationships} relationships
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] bg-[var(--surface)] px-3 py-1 rounded-lg border border-[var(--border)]">
                      <Timer size={13} />
                      {formatTime(result.processingTime)}
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
              </div>

              {/* Export buttons */}
              <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-[var(--border)]">
                <span className="text-sm font-semibold text-[var(--text-muted)] mr-1">Export SQL as:</span>
                <button
                  onClick={() => { navigator.clipboard.writeText(result.sql); toast.success("SQL copied!"); }}
                  className="btn-ghost text-sm px-4 py-2">
                  <Copy size={14} /> Copy SQL
                </button>
                <button
                  onClick={() => downloadText(result.sql, `${baseName}.sql`)}
                  className="btn-ghost text-sm px-4 py-2">
                  <Download size={14} /> .sql
                </button>
                <button
                  onClick={() => downloadText(result.sql, `${baseName}.txt`)}
                  className="btn-ghost text-sm px-4 py-2">
                  <FileText size={14} /> .txt
                </button>
                <button
                  onClick={() => downloadJSON({ description: result.description, sql: result.sql, mermaid: result.mermaid, stats: result.stats }, `${baseName}.json`)}
                  className="btn-ghost text-sm px-4 py-2">
                  <FileJson size={14} /> .json
                </button>
                <button
                  onClick={() => { setPlaygroundInitialSQL(result.sql); onNavigate("playground"); }}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold
                    bg-gradient-to-r from-emerald-600 to-emerald-700 text-white
                    hover:shadow-lg hover:shadow-emerald-500/25 transition-all">
                  <Terminal size={14} /> Open in Playground
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(result.mermaid); toast.success("Diagram copied!"); }}
                  className="btn-ghost text-sm px-4 py-2 ml-auto">
                  <Copy size={14} /> Copy Mermaid
                </button>
                <button
                  onClick={openSaveModal}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold
                    bg-gradient-to-r from-primary-600 to-primary-700 text-white
                    hover:shadow-lg hover:shadow-primary-500/25 transition-all">
                  <Save size={14} /> Save to Project
                </button>
              </div>
            </div>

            {/* Tabs: Diagram / SQL */}
            <div className="card overflow-hidden">
              <div className="flex items-center border-b border-[var(--border)]">
                {(["diagram", "sql"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-6 py-3.5 text-sm font-semibold transition-colors capitalize",
                      activeTab === tab
                        ? "text-primary-600 border-b-2 border-primary-600 -mb-px bg-primary-50 dark:bg-primary-900/20"
                        : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
                    )}
                  >
                    {tab === "diagram"
                      ? (DIAGRAM_TYPES.find(d => d.value === diagramType)?.label ?? "ER Diagram")
                      : "SQL DDL"}
                  </button>
                ))}
              </div>

              {/* Diagram tab */}
              {activeTab === "diagram" && (
                <div className="p-5">
                  {mermaidSvg ? (
                    <div
                      ref={diagramRef}
                      className="overflow-auto rounded-xl border border-[var(--border)] bg-white dark:bg-[var(--surface)] p-4"
                      style={{ minHeight: 320 }}
                      dangerouslySetInnerHTML={{ __html: mermaidSvg }}
                    />
                  ) : mermaidError ? (
                    <div className="flex flex-col items-center gap-4 py-12 text-center">
                      <AlertTriangle size={24} className="text-amber-500" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">Diagram preview unavailable</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">The Mermaid syntax may need a tweak. You can still copy/download the SQL.</p>
                      </div>
                      <details className="text-left w-full max-w-lg">
                        <summary className="text-xs text-primary-600 cursor-pointer font-medium">Show raw Mermaid syntax</summary>
                        <pre className="mt-2 p-3 rounded-lg bg-[var(--surface)] text-xs text-[var(--text)] overflow-auto border border-[var(--border)] whitespace-pre-wrap">
                          {result.mermaid}
                        </pre>
                      </details>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-16">
                      <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              )}

              {/* SQL tab */}
              {activeTab === "sql" && (
                <div>
                  <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
                    <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Generated SQL</span>
                    <span className="text-xs font-mono text-[var(--text-subtle)]">
                      {result.sql.split("\n").length} lines
                    </span>
                  </div>
                  <div className="h-[520px]">
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
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <UpgradeLimitDialog
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        reason="conversions"
        onNavigatePricing={() => onNavigate("pricing")}
      />

      {/* ── Save to Project modal ── */}
      <AnimatePresence>
        {saveOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md p-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                    <FolderOpen size={16} className="text-primary-600" />
                  </div>
                  <h2 className="text-base font-bold text-[var(--text)]">Save to Project</h2>
                </div>
                <button onClick={() => setSaveOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Schema snippet preview */}
              <div className="mb-5 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <p className="text-xs font-semibold text-[var(--text-muted)] mb-1">Schema to save</p>
                <p className="text-sm text-[var(--text)] line-clamp-2">"{result?.description}"</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-[var(--text-subtle)]">{result?.stats.tables} tables</span>
                  <span className="text-[10px] text-[var(--text-subtle)]">·</span>
                  <span className="text-[10px] text-[var(--text-subtle)]">{result?.stats.relationships} relationships</span>
                  <span className={cn("ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full", activeDb.bg, activeDb.color)}>
                    {activeDb.label}
                  </span>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="flex rounded-xl border border-[var(--border)] overflow-hidden mb-4">
                {(["existing", "new"] as const).map((mode) => (
                  <button key={mode} onClick={() => setSaveMode(mode)}
                    className={cn(
                      "flex-1 py-2.5 text-sm font-semibold transition-colors",
                      saveMode === mode
                        ? "bg-primary-600 text-white"
                        : "text-[var(--text-muted)] hover:bg-[var(--surface)]"
                    )}>
                    {mode === "existing" ? "Existing Project" : "New Project"}
                  </button>
                ))}
              </div>

              {saveMode === "existing" ? (
                myProjects.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-sm text-[var(--text-muted)] mb-3">No projects yet.</p>
                    <button onClick={() => setSaveMode("new")}
                      className="btn-ghost text-sm"><Plus size={13} /> Create one</button>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto mb-4">
                    {myProjects.map((p) => (
                      <button key={p.id} onClick={() => setSaveProjectId(p.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all",
                          saveProjectId === p.id
                            ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                            : "border-[var(--border)] hover:border-primary-300 hover:bg-[var(--surface)]"
                        )}>
                        <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                          <Database size={14} className="text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text)] truncate">{p.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{p.files.length} files · {p.dbType}</p>
                        </div>
                        {saveProjectId === p.id && (
                          <CheckCircle size={16} className="text-primary-600 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Project Name</label>
                  <input
                    autoFocus
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. University Database"
                    className="w-full py-2.5 px-4 text-sm rounded-xl border border-[var(--border)]
                      bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)]
                      focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-[var(--border)]">
                <button onClick={() => setSaveOpen(false)} className="btn-ghost flex-1 justify-center text-sm py-2.5">
                  Cancel
                </button>
                <button
                  onClick={confirmSave}
                  disabled={saving || (saveMode === "existing" && !saveProjectId)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold
                    bg-gradient-to-r from-primary-600 to-primary-700 text-white
                    hover:shadow-lg hover:shadow-primary-500/25 transition-all
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {saving ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><Save size={14} /> Save</>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
