"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Sparkles,
  X,
  Send,
  Loader2,
  Copy,
  Check,
  Trash2,
  Database,
  Zap,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Link2,
  Table as TableIcon,
  ShieldAlert,
  Plus,
  FileCode,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { getQuestionCreditCost, aiGenerationsLeft } from "@/lib/subscription";
import { parseSQLSchema, type Schema, type Table } from "@/lib/sqlParser";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  SQLResponseCard,
  SchemaIssueCard,
  AISuggestionCard,
  ExplanationResponseCard,
} from "@/components/AIResponseCards";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  timestamp: number;
}

const EXAMPLE_PROMPTS = [
  {
    title: "Explain my database",
    prompt: "Explain my database schema in detail. List key tables, columns, and overall structure.",
    badge: "Schema",
  },
  {
    title: "What relationships do I have?",
    prompt: "What relationships do I have in my database schema? List all foreign keys and connections.",
    badge: "Relations",
  },
  {
    title: "Suggest indexes for my tables",
    prompt: "Suggest optimal indexes for my connected tables to improve query execution speed.",
    badge: "Performance",
  },
  {
    title: "Explain this SQL query",
    prompt: "Explain how a SELECT query with JOINs and WHERE clauses executes step-by-step.",
    badge: "SQL",
  },
];

/** Build human-readable structured context for the AI prompt */
function buildSchemaContextString(schema: Schema): string {
  if (!schema.tables.length) return "No database schema is currently connected.";

  const tablesText = schema.tables
    .map((t) => {
      const cols = t.columns
        .map((c) => {
          let info = `- ${c.name} ${c.type}`;
          if (c.isPrimaryKey) info += " PRIMARY KEY";
          if (c.isForeignKey && c.references) {
            info += ` FOREIGN KEY → ${c.references.table}.${c.references.column}`;
          }
          return info;
        })
        .join("\n");
      return `${t.name}:\n${cols}`;
    })
    .join("\n\n");

  const relsText =
    schema.relationships.length > 0
      ? "\n\nRelationships:\n" +
        schema.relationships
          .map((r) => `- ${r.fromTable}.${r.fromColumn} → ${r.toTable}.${r.toColumn} (${r.cardinality})`)
          .join("\n")
      : "";

  return tablesText + relsText;
}

/** Generate schema-aware mock response when AI backend API key is missing or fails */
function generateSchemaAwareMockResponse(
  question: string,
  schema: Schema
): { prose: string; sql?: string } {
  const q = question.toLowerCase();
  const hasSchema = schema.tables.length > 0;

  if (!hasSchema) {
    return {
      prose:
        "**No database schema is currently connected.**\n\nI can still answer general SQL and database design questions. Once you load a project with DDL files or write SQL in the Playground, I will provide schema-specific analysis.",
      sql: `-- General SQL Query Example
SELECT 
  id, 
  name, 
  created_at 
FROM example_table 
WHERE status = 'active';`,
    };
  }

  // --- Connected Schema Responses using REAL tables and columns ---
  const tableNames = schema.tables.map((t) => t.name).join(", ");

  if (q.includes("explain") || q.includes("schema") || q.includes("database")) {
    const tableBreakdown = schema.tables
      .map((t) => {
        const pk = t.columns.filter((c) => c.isPrimaryKey).map((c) => c.name).join(", ") || "None";
        const fks = t.columns.filter((c) => c.isForeignKey).map((c) => `${c.name} → ${c.references?.table}`).join(", ") || "None";
        return `- **\`${t.name}\`** (${t.columns.length} columns)\n  - Primary Key: \`${pk}\`\n  - Foreign Keys: ${fks}`;
      })
      .join("\n");

    const sampleTable = schema.tables[0];
    const sampleCols = sampleTable.columns.slice(0, 3).map((c) => c.name).join(", ");

    return {
      prose: `### Connected Database Schema Overview\n\nYour database contains **${schema.tables.length} table${schema.tables.length !== 1 ? "s" : ""}** and **${schema.relationships.length} relationship${schema.relationships.length !== 1 ? "s" : ""}**:\n\n${tableBreakdown}\n\n**Connected Tables:** ${tableNames}`,
      sql: `SELECT \n  ${sampleCols}\nFROM ${sampleTable.name}\nLIMIT 10;`,
    };
  }

  if (q.includes("relationship") || q.includes("foreign key") || q.includes("connect")) {
    if (schema.relationships.length === 0) {
      return {
        prose: `### Schema Relationships Analysis\n\nCurrently, **no explicit foreign key relationships** were detected between your connected tables (${tableNames}).\n\n**Recommendation:** Add \`FOREIGN KEY\` constraints between matching ID fields to maintain referential integrity and speed up joins.`,
        sql: schema.tables.length >= 2
          ? `ALTER TABLE ${schema.tables[1].name}\n  ADD CONSTRAINT fk_${schema.tables[1].name}_ref\n  FOREIGN KEY (${schema.tables[1].columns[0]?.name || "id"}) REFERENCES ${schema.tables[0].name}(id);`
          : undefined,
      };
    }

    const relList = schema.relationships
      .map((r) => `- **\`${r.fromTable}.${r.fromColumn}\`** → **\`${r.toTable}.${r.toColumn}\`** (${r.cardinality})`)
      .join("\n");

    const firstRel = schema.relationships[0];

    return {
      prose: `### Active Database Relationships\n\nYour schema has **${schema.relationships.length} foreign key relationship${schema.relationships.length !== 1 ? "s" : ""}**:\n\n${relList}`,
      sql: `SELECT \n  a.*,\n  b.*\nFROM ${firstRel.fromTable} a\nJOIN ${firstRel.toTable} b ON a.${firstRel.fromColumn} = b.${firstRel.toColumn};`,
    };
  }

  if (q.includes("find") || q.includes("query") || q.includes("how can i")) {
    const mainTable = schema.tables[0];
    const firstCol = mainTable.columns[0]?.name || "id";
    const secondCol = mainTable.columns[1]?.name || "name";

    return {
      prose: `### Query for \`${mainTable.name}\` Table\n\nHere is an optimized SQL query based on your actual connected schema table \`${mainTable.name}\`:`,
      sql: `SELECT \n  ${firstCol},\n  ${secondCol}\nFROM ${mainTable.name}\nWHERE ${firstCol} IS NOT NULL\nORDER BY ${firstCol} DESC;`,
    };
  }

  // Default fallback using real connected schema
  const primaryTable = schema.tables[0].name;
  return {
    prose: `Analysis for question **"${question}"** against connected table \`${primaryTable}\`:\n\n- **Connected Context**: Provided schema contains ${schema.tables.length} tables (${tableNames}).\n- **Optimization**: Ensure indexes exist on foreign key columns for faster join processing.`,
  };
}

function CodeSnippet({ sql, onApplyToPlayground }: { sql: string; onApplyToPlayground?: (s: string) => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    toast.success("SQL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2 rounded-xl border border-[var(--border)] overflow-hidden bg-[var(--surface)] text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] font-mono">
          SQL Snippet
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
            {copied ? "Copied" : "Copy SQL"}
          </button>
          {onApplyToPlayground && (
            <button
              onClick={() => onApplyToPlayground(sql)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border border-[var(--primary-border,rgba(37,99,235,0.3))] text-[var(--primary)] bg-[var(--primary-light)] hover:opacity-80 transition-opacity cursor-pointer"
            >
              Apply to Playground
            </button>
          )}
        </div>
      </div>
      <pre className="p-3 font-mono text-[var(--text)] overflow-x-auto leading-relaxed text-[11px] max-h-48">
        {sql}
      </pre>
    </div>
  );
}

export default function AIAssistantPanel() {
  const { aiAssistantOpen, setAiAssistantOpen, projects, activeProjectId, setActiveProject, playgroundInitialSQL, setPlaygroundInitialSQL, copilotContext, getSubscription, incrementAIGenerations } = useStore();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showSchemaDetails, setShowSchemaDetails] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedSQL, setPastedSQL] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleConnectPastedSchema = useCallback(() => {
    if (!pastedSQL.trim()) {
      toast.error("Please paste valid SQL DDL statements");
      return;
    }
    setPlaygroundInitialSQL(pastedSQL.trim());
    setShowPasteModal(false);
    setPastedSQL("");
    toast.success("Schema connected to AI Copilot!");
  }, [pastedSQL, setPlaygroundInitialSQL]);

  // Extract raw SQL DDL from state
  const rawSQL = useMemo(() => {
    const parts: string[] = [];
    if (activeProjectId) {
      const proj = projects.find((p) => p.id === activeProjectId);
      if (proj) {
        const sqls = proj.files
          .filter((f) => f.status === "completed" && f.sql)
          .map((f) => f.sql!.trim());
        if (sqls.length) parts.push(sqls.join("\n\n"));
      }
    }
    if (playgroundInitialSQL?.trim()) {
      parts.push(playgroundInitialSQL.trim());
    }
    if (copilotContext?.currentSql?.trim()) {
      parts.push(copilotContext.currentSql.trim());
    }
    return parts.join("\n\n");
  }, [projects, activeProjectId, playgroundInitialSQL, copilotContext]);

  // Parse SQL Schema
  const parsedSchema = useMemo(() => {
    try {
      return parseSQLSchema(rawSQL);
    } catch (e) {
      console.warn("Schema parsing error:", e);
      return { tables: [], relationships: [] };
    }
  }, [rawSQL]);

  const hasSchema = parsedSchema.tables.length > 0;
  const schemaContextString = useMemo(() => buildSchemaContextString(parsedSchema), [parsedSchema]);

  // Smart Contextual Quick Actions
  const copilotQuickActions = useMemo(() => {
    if (copilotContext?.source === "playground") {
      return [
        { label: "Explain SQL", prompt: "Explain this SQL query in detail step-by-step." },
        { label: "Optimize SQL", prompt: "Analyze and optimize this SQL query for performance and indexing." },
        { label: "Find Issues", prompt: "Check this SQL query for syntax errors, missing constraints, or risks." },
        { label: "Generate Alternative", prompt: "Provide a clean alternative version of this SQL query." },
      ];
    }
    if (copilotContext?.source === "er-diagram") {
      return [
        { label: "Analyze Schema", prompt: "Analyze this ER diagram schema for missing primary keys, unindexed foreign keys, and structural issues." },
        { label: "Explain Relationships", prompt: "List and explain all foreign key relationships in this ER diagram." },
        { label: "Find Problems", prompt: "Identify any design flaws, circular references, or missing indexes in this ER diagram." },
        { label: "Suggest Improvements", prompt: "Suggest table, column, and relationship improvements for this ER diagram." },
      ];
    }
    return [
      { label: "Explain Schema", prompt: "Explain this database structure in plain English. Describe what each table does." },
      { label: "Find Relationships", prompt: "List all foreign key relationships and connections in this database." },
      { label: "Suggest Indexes", prompt: "Suggest optimal indexes to improve query speed on this schema." },
      { label: "Check Normalization", prompt: "Check normalization levels (1NF, 2NF, 3NF) for this schema." },
    ];
  }, [copilotContext?.source]);

  const handleApplyToPlayground = useCallback((targetSql: string) => {
    setPlaygroundInitialSQL(targetSql);
    setAiAssistantOpen(false);
    window.dispatchEvent(new CustomEvent("navigate", { detail: "playground" }));
    toast.success("SQL applied to Playground editor");
  }, [setPlaygroundInitialSQL, setAiAssistantOpen]);

  // Auto scroll to bottom
  useEffect(() => {
    if (aiAssistantOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading, aiAssistantOpen]);

  const handleSend = useCallback(
    async (textToSend?: string) => {
      const query = (textToSend ?? input).trim();
      if (!query || isLoading) return;

      const cost = getQuestionCreditCost(query, "chat");
      const sub = getSubscription();
      const creditsRemaining = aiGenerationsLeft(sub);

      if (creditsRemaining < cost) {
        toast.error(`Insufficient AI credits. Required: ${cost} credits, available: ${creditsRemaining} credits.`);
        return;
      }

      incrementAIGenerations(cost);
      toast.success(`-${cost} AI credits (${creditsRemaining - cost} left)`);

      setErrorMessage(null);
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: query,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      if (!textToSend) setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chat",
            input: query,
            schema: rawSQL,
            schemaContext: schemaContextString,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok && data.answer) {
          const fenced = data.answer.match(/```[\w]*\n([\s\S]*?)```/);
          const sqlMatch = data.answer.match(/SQL:\s*\n([\s\S]+)/i);

          let prose = data.answer;
          let extractedSql: string | undefined;

          if (fenced) {
            extractedSql = fenced[1].trim();
            prose = data.answer.replace(/```[\w]*\n[\s\S]*?```/, "").trim();
          } else if (sqlMatch) {
            const idx = data.answer.search(/SQL:\s*\n/i);
            prose = data.answer.slice(0, idx).trim();
            extractedSql = sqlMatch[1].trim();
          }

          const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: prose,
            sql: extractedSql,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setIsLoading(false);
          return;
        }

        // If backend returned error message
        if (data.error && res.status !== 503) {
          setErrorMessage(`AI Error: ${data.error}`);
        }
        throw new Error(data.error ?? "API unconfigured");
      } catch {
        // Fallback to schema-aware mock response
        setTimeout(() => {
          const mock = generateSchemaAwareMockResponse(query, parsedSchema);
          const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: mock.prose,
            sql: mock.sql,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setIsLoading(false);
        }, 500);
      }
    },
    [input, isLoading, rawSQL, schemaContextString, parsedSchema]
  );

  return (
    <AnimatePresence>
      {aiAssistantOpen && (
        <>
          {/* Overlay backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAiAssistantOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
          />

          {/* Slide-over panel */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className={cn(
              "fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[600px] md:w-[720px] lg:w-[840px]",
              "flex flex-col bg-[var(--card)] border-l border-[var(--border)] shadow-2xl overflow-hidden"
            )}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface)]">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center shadow-xs"
                  style={{ background: "var(--primary)" }}
                >
                  <Sparkles size={16} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[var(--text)]">AI Assistant</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--primary-light)] text-[var(--primary)] border border-[var(--primary-border,rgba(139,170,130,0.3))]">
                      Schema Lens
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-subtle)]">
                    Schema-aware database assistant
                  </p>
                </div>
              </div>

              <button
                onClick={() => setAiAssistantOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--card)] hover:text-[var(--text)] transition-colors"
                aria-label="Close AI Assistant"
              >
                <X size={16} />
              </button>
            </div>

            {/* Schema Context Status Indicator Banner */}
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--card)] text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      "w-2 h-2 rounded-full",
                      copilotContext?.source === "playground"
                        ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                        : copilotContext?.source === "er-diagram"
                        ? "bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                        : hasSchema
                        ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        : "bg-amber-500"
                    )}
                  />
                  <span className="font-bold text-[var(--text)]">
                    {copilotContext?.source === "playground"
                      ? "Context: SQL Playground"
                      : copilotContext?.source === "er-diagram"
                      ? "Context: ER Diagram"
                      : hasSchema
                      ? "Context: Schema Connected"
                      : "No schema connected"}
                  </span>
                  {copilotContext?.selectedLinesCount && copilotContext.selectedLinesCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 font-bold">
                      Selected SQL: {copilotContext.selectedLinesCount} line{copilotContext.selectedLinesCount > 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowPasteModal(true)}
                    className="text-[10px] font-semibold text-[var(--primary)] hover:underline flex items-center gap-0.5 cursor-pointer px-1.5 py-0.5 rounded border border-[var(--primary-border,rgba(37,99,235,0.3))] bg-[var(--primary-light)]"
                  >
                    <FileCode size={10} /> Paste DDL
                  </button>
                  {hasSchema && (
                    <button
                      onClick={() => setShowSchemaDetails((v) => !v)}
                      className="flex items-center gap-0.5 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <span>View</span>
                      {showSchemaDetails ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Connected Schema / No Schema options */}
              {hasSchema ? (
                <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-[var(--text-muted)]">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 font-medium">
                      <CheckCircle2 size={11} className="text-emerald-500" />
                      {parsedSchema.tables.length} Table{parsedSchema.tables.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <Link2 size={11} className="text-[var(--primary)]" />
                      {parsedSchema.relationships.length} Rel{parsedSchema.relationships.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {projects.length > 0 && (
                    <select
                      value={activeProjectId || ""}
                      onChange={(e) => setActiveProject(e.target.value || null)}
                      className="px-2 py-0.5 rounded border text-[10px] font-semibold bg-[var(--surface)] text-[var(--text)] border-[var(--border)] outline-none cursor-pointer"
                    >
                      <option value="">Switch Project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className="mt-2 pt-1 flex items-center justify-between gap-2">
                  {projects.length > 0 ? (
                    <select
                      value={activeProjectId || ""}
                      onChange={(e) => setActiveProject(e.target.value || null)}
                      className="flex-1 px-2 py-1 rounded-lg border text-[11px] font-semibold bg-[var(--surface)] text-[var(--text)] border-[var(--border)] outline-none cursor-pointer"
                    >
                      <option value="">-- Connect Project --</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.dbType})</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] text-[var(--text-subtle)]">Connect a schema to start.</span>
                  )}

                  <button
                    onClick={() => {
                      setAiAssistantOpen(false);
                      window.dispatchEvent(new CustomEvent("navigate", { detail: "projects" }));
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all cursor-pointer flex items-center gap-1 flex-shrink-0"
                  >
                    <Plus size={10} /> Add Project
                  </button>
                </div>
              )}

              {/* Expandable Schema Table Details */}
              <AnimatePresence>
                {hasSchema && showSchemaDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden mt-2 pt-2 border-t border-[var(--border)]"
                  >
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {parsedSchema.tables.map((tbl) => (
                        <div
                          key={tbl.name}
                          className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11px]"
                        >
                          <div className="flex items-center justify-between font-mono font-bold text-[var(--text)] mb-1">
                            <span className="flex items-center gap-1.5">
                              <TableIcon size={12} className="text-[var(--primary)]" />
                              {tbl.name}
                            </span>
                            <span className="text-[10px] text-[var(--text-subtle)] font-sans font-normal">
                              {tbl.columns.length} cols
                            </span>
                          </div>
                          <div className="space-y-0.5 text-[10px] text-[var(--text-muted)] font-mono pl-4">
                            {tbl.columns.map((c) => (
                              <div key={c.name} className="flex items-center justify-between">
                                <span>
                                  {c.name}{" "}
                                  <span className="text-[var(--text-subtle)]">({c.type})</span>
                                </span>
                                <span className="text-[9px]">
                                  {c.isPrimaryKey && <span className="text-amber-500 font-bold mr-1">PK</span>}
                                  {c.isForeignKey && <span className="text-blue-500 font-bold">FK</span>}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Error banner if needed */}
              {errorMessage && (
                <div className="p-3 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <ShieldAlert size={14} className="flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Example Prompts Cards (shown when chat is empty) */}
              {messages.length === 0 && (
                <div className="space-y-4 py-2">
                  <div className="p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                    <div className="flex items-center gap-2 mb-1.5 text-[var(--primary)]">
                      <Bot size={18} />
                      <span className="text-xs font-bold text-[var(--text)]">
                        {hasSchema
                          ? "Connected to your active database schema"
                          : "General SQL & Database Assistant"}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      {hasSchema
                        ? `Your current schema (${parsedSchema.tables.length} tables, ${parsedSchema.relationships.length} relationships) is connected. Ask questions or try an example prompt.`
                        : "No database schema is connected yet. Ask general SQL questions or load a project to connect your schema."}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] mb-2 flex items-center gap-1">
                      <Zap size={10} /> Example Prompts
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {EXAMPLE_PROMPTS.map((ex) => (
                        <button
                          key={ex.title}
                          onClick={() => handleSend(ex.prompt)}
                          className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)]/50 hover:bg-[var(--surface)] text-left transition-all group cursor-pointer"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                              {ex.title}
                            </p>
                            <p className="text-[11px] text-[var(--text-subtle)] truncate mt-0.5">
                              {ex.prompt}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--surface)] text-[var(--text-subtle)] border border-[var(--border)] flex-shrink-0">
                            {ex.badge}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Chat Message List */}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === "assistant" && (
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                      style={{ background: "var(--primary-light)" }}
                    >
                      <Bot size={14} style={{ color: "var(--primary)" }} />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[85%] space-y-1.5",
                      msg.role === "user" ? "items-end" : "items-start"
                    )}
                  >
                    {msg.role === "user" ? (
                      <div
                        className="px-3.5 py-2.5 rounded-2xl rounded-tr-xs text-xs leading-relaxed text-white shadow-xs"
                        style={{ background: "var(--primary)" }}
                      >
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
                            <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-xs text-xs leading-relaxed text-[var(--text)] bg-[var(--surface)] border border-[var(--border)]">
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            </div>
                            <div className="flex items-center gap-2 pl-1">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content);
                                  toast.success("Explanation copied!");
                                }}
                                className="text-[10px] font-semibold text-[var(--text-subtle)] hover:text-[var(--primary)] flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <Copy size={10} /> Copy Explanation
                              </button>
                            </div>
                          </>
                        )}

                        {msg.sql && (
                          <SQLResponseCard
                            sql={msg.sql}
                            label="Generated SQL"
                            onOpenPlayground={handleApplyToPlayground}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {msg.role === "user" && (
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5 text-[11px] font-bold text-white shadow-xs"
                      style={{ background: "var(--primary)" }}
                    >
                      You
                    </div>
                  )}
                </div>
              ))}

              {/* Loading Indicator State */}
              {isLoading && (
                <div className="flex gap-3 items-start">
                  <div
                    className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center mt-0.5"
                    style={{ background: "var(--primary-light)" }}
                  >
                    <Bot size={14} style={{ color: "var(--primary)" }} />
                  </div>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-xs border border-[var(--border)] bg-[var(--surface)] flex items-center gap-2">
                    <Loader2 size={13} className="animate-spin text-[var(--primary)]" />
                    <span className="text-xs text-[var(--text-muted)] font-medium">
                      Analyzing schema and generating answer...
                    </span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Panel Input Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)] space-y-2.5">
              {/* Contextual Smart Quick Actions */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                {copilotQuickActions.map((qa) => (
                  <button
                    key={qa.label}
                    onClick={() => handleSend(qa.prompt)}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-[var(--border)] bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]/40 whitespace-nowrap transition-all disabled:opacity-50 cursor-pointer flex-shrink-0"
                  >
                    {qa.label}
                  </button>
                ))}
              </div>

              {messages.length > 0 && (
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] text-[var(--text-subtle)] font-medium">
                    {hasSchema ? `Schema Context: ${parsedSchema.tables.length} Tables` : "No Schema Connected"}
                  </span>
                  <button
                    onClick={() => setMessages([])}
                    className="flex items-center gap-1 text-[10px] text-[var(--text-subtle)] hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 size={10} /> Clear Chat
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    copilotContext?.source === "playground"
                      ? "Ask Copilot about your SQL Playground..."
                      : copilotContext?.source === "er-diagram"
                      ? "Ask Copilot about your ER Diagram..."
                      : hasSchema
                      ? "Ask about your connected schema..."
                      : "Ask a general database question..."
                  }
                  disabled={isLoading}
                  className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] text-xs placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 focus:border-[var(--primary)] transition-all px-3.5 py-2.5 disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                  className="btn-primary px-3.5 py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                </button>
              </div>
            </div>
          </motion.aside>

          {/* Paste Schema Modal for Side Panel */}
          {showPasteModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
              <div className="card w-full max-w-lg p-5 space-y-4 shadow-2xl relative">
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileCode size={16} className="text-[var(--primary)]" />
                    <h3 className="text-sm font-bold text-[var(--text)]">Paste Database Schema</h3>
                  </div>
                  <button
                    onClick={() => setShowPasteModal(false)}
                    className="p-1 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                </div>

                <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Paste your SQL DDL statements (e.g. <code className="font-mono text-[var(--primary)]">CREATE TABLE ...</code>) to attach schema context to the AI Copilot.
                </p>

                <textarea
                  value={pastedSQL}
                  onChange={(e) => setPastedSQL(e.target.value)}
                  placeholder={`CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) NOT NULL UNIQUE\n);`}
                  rows={6}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-xs font-mono p-3 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/25 focus:border-[var(--primary)] transition-all resize-y leading-relaxed"
                />

                <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-[var(--border)]">
                  <button
                    onClick={() => setShowPasteModal(false)}
                    className="btn-ghost text-xs px-3.5 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConnectPastedSchema}
                    disabled={!pastedSQL.trim()}
                    className="btn-primary text-xs px-3.5 py-1.5 disabled:opacity-50"
                  >
                    Connect Schema
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
