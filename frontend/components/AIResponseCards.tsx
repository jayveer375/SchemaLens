"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Check,
  Play,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  Sparkles,
  Search,
  Table as TableIcon,
  Link2,
  Filter,
  Layers,
  Zap,
  ChevronDown,
  ChevronUp,
  FileCode,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

// ─────────────────────────────────────────────────────────────────────────────
// 1. SQL SYNTAX HIGHLIGHTER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function SQLSyntaxHighlighter({ code }: { code: string }) {
  const tokens = useMemo(() => {
    const lines = code.split("\n");
    return lines.map((line) => {
      const lineTokens: {
        text: string;
        type: "keyword" | "string" | "comment" | "number" | "symbol" | "plain";
      }[] = [];

      let cursor = 0;
      while (cursor < line.length) {
        // Comment (-- line comment)
        if (line.slice(cursor).startsWith("--")) {
          lineTokens.push({ text: line.slice(cursor), type: "comment" });
          cursor = line.length;
          break;
        }

        // Single quoted string
        if (line[cursor] === "'") {
          let end = cursor + 1;
          while (end < line.length && (line[end] !== "'" || line[end - 1] === "\\")) {
            end++;
          }
          if (end < line.length) end++;
          lineTokens.push({ text: line.slice(cursor, end), type: "string" });
          cursor = end;
          continue;
        }

        // Double quoted identifier / string
        if (line[cursor] === '"') {
          let end = cursor + 1;
          while (end < line.length && line[end] !== '"') {
            end++;
          }
          if (end < line.length) end++;
          lineTokens.push({ text: line.slice(cursor, end), type: "string" });
          cursor = end;
          continue;
        }

        // Number
        const numMatch = line.slice(cursor).match(/^\b\d+(\.\d+)?\b/);
        if (numMatch) {
          lineTokens.push({ text: numMatch[0], type: "number" });
          cursor += numMatch[0].length;
          continue;
        }

        // Word (Keywords vs Identifier)
        const wordMatch = line.slice(cursor).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
        if (wordMatch) {
          const word = wordMatch[0];
          const upper = word.toUpperCase();
          const SQL_KEYWORDS = new Set([
            "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS",
            "ON", "GROUP", "BY", "ORDER", "HAVING", "LIMIT", "OFFSET", "INSERT", "INTO", "VALUES",
            "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "INDEX", "ALTER", "DROP", "ADD", "CONSTRAINT",
            "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "AND", "OR", "NOT", "IN", "IS", "NULL", "AS",
            "CASE", "WHEN", "THEN", "ELSE", "END", "UNION", "ALL", "EXISTS", "LIKE", "ILIKE", "BETWEEN",
            "DISTINCT", "DEFAULT", "CASCADE", "UNIQUE", "CHECK", "WITH", "RECURSIVE", "CAST", "VIEW",
            "INT", "INTEGER", "VARCHAR", "TEXT", "BOOLEAN", "TIMESTAMP", "DATE", "SERIAL", "BIGINT",
            "DECIMAL", "NUMERIC", "FLOAT", "JSON", "JSONB"
          ]);

          if (SQL_KEYWORDS.has(upper)) {
            lineTokens.push({ text: word, type: "keyword" });
          } else {
            lineTokens.push({ text: word, type: "plain" });
          }
          cursor += word.length;
          continue;
        }

        // Single symbol
        lineTokens.push({ text: line[cursor], type: "symbol" });
        cursor++;
      }
      return lineTokens;
    });
  }, [code]);

  return (
    <pre className="p-3 font-mono text-[11px] sm:text-xs leading-relaxed overflow-x-auto select-text">
      {tokens.map((lineTokens, lineIdx) => (
        <div key={lineIdx} className="table-row">
          <span className="table-cell select-none pr-3 text-right text-[10px] text-[var(--text-subtle)] opacity-40 font-mono">
            {lineIdx + 1}
          </span>
          <span className="table-cell">
            {lineTokens.map((tok, tokIdx) => {
              if (tok.type === "keyword") {
                return (
                  <span key={tokIdx} className="font-bold text-blue-600 dark:text-[#9ABA90]">
                    {tok.text}
                  </span>
                );
              }
              if (tok.type === "string") {
                return (
                  <span key={tokIdx} className="text-emerald-600 dark:text-emerald-400">
                    {tok.text}
                  </span>
                );
              }
              if (tok.type === "comment") {
                return (
                  <span key={tokIdx} className="italic text-slate-400 dark:text-[var(--text-subtle)]">
                    {tok.text}
                  </span>
                );
              }
              if (tok.type === "number") {
                return (
                  <span key={tokIdx} className="text-amber-600 dark:text-amber-400 font-semibold">
                    {tok.text}
                  </span>
                );
              }
              if (tok.type === "symbol") {
                return (
                  <span key={tokIdx} className="text-slate-500 dark:text-slate-400">
                    {tok.text}
                  </span>
                );
              }
              return <span key={tokIdx} className="text-[var(--text)]">{tok.text}</span>;
            })}
          </span>
        </div>
      ))}
    </pre>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SQL RESPONSE CARD
// ─────────────────────────────────────────────────────────────────────────────

export interface SQLResponseCardProps {
  sql: string;
  label?: string;
  onOpenPlayground?: (sql: string) => void;
}

export function SQLResponseCard({
  sql,
  label = "Generated SQL",
  onOpenPlayground,
}: SQLResponseCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    toast.success("SQL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-sm transition-all hover:border-[var(--primary)]/30">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-1.5">
          <FileCode size={13} className="text-[var(--primary)]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)] font-sans">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-subtle)] transition-all cursor-pointer"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy SQL"}
          </button>
          {onOpenPlayground && (
            <button
              onClick={() => onOpenPlayground(sql)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--primary-border,rgba(37,99,235,0.3))] text-[var(--primary)] bg-[var(--primary-light)] hover:opacity-90 transition-all cursor-pointer"
            >
              <Play size={11} className="fill-current" />
              Open in Playground
            </button>
          )}
        </div>
      </div>

      {/* Syntax highlighted code body */}
      <div className="max-h-64 overflow-y-auto bg-[var(--card)]">
        <SQLSyntaxHighlighter code={sql} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SCHEMA ISSUE CARD
// ─────────────────────────────────────────────────────────────────────────────

export interface SchemaIssueCardProps {
  title: string;
  severity: "error" | "warning" | "issue" | "good";
  explanation: string;
  whyItMatters?: string;
  suggestedSolution?: string;
  sqlFix?: string;
  table?: string;
  column?: string;
  onOpenPlayground?: (sql: string) => void;
}

const SEVERITY_THEMES = {
  error: {
    icon: ShieldAlert,
    badgeLabel: "Error",
    badgeBg: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
    border: "border-red-200 dark:border-red-500/20",
    headerBg: "bg-red-50/50 dark:bg-red-500/5",
    iconColor: "text-red-500",
  },
  issue: {
    icon: ShieldAlert,
    badgeLabel: "Issue",
    badgeBg: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
    border: "border-red-200 dark:border-red-500/20",
    headerBg: "bg-red-50/50 dark:bg-red-500/5",
    iconColor: "text-red-500",
  },
  warning: {
    icon: AlertTriangle,
    badgeLabel: "Warning",
    badgeBg: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20",
    border: "border-amber-200 dark:border-amber-500/20",
    headerBg: "bg-amber-50/50 dark:bg-amber-500/5",
    iconColor: "text-amber-500",
  },
  good: {
    icon: CheckCircle2,
    badgeLabel: "Passed",
    badgeBg: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
    border: "border-emerald-200 dark:border-emerald-500/20",
    headerBg: "bg-emerald-50/50 dark:bg-emerald-500/5",
    iconColor: "text-emerald-500",
  },
};

export function SchemaIssueCard({
  title,
  severity,
  explanation,
  whyItMatters,
  suggestedSolution,
  sqlFix,
  table,
  column,
  onOpenPlayground,
}: SchemaIssueCardProps) {
  const theme = SEVERITY_THEMES[severity] || SEVERITY_THEMES.warning;
  const Icon = theme.icon;
  const [copied, setCopied] = useState(false);

  const handleCopySql = async () => {
    if (!sqlFix) return;
    await navigator.clipboard.writeText(sqlFix);
    setCopied(true);
    toast.success("Fix SQL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("my-3.5 rounded-xl border bg-[var(--card)] overflow-hidden shadow-xs transition-all", theme.border)}>
      {/* Header */}
      <div className={cn("flex items-start justify-between p-4 border-b border-[var(--border)]", theme.headerBg)}>
        <div className="flex items-start gap-3">
          <Icon size={18} className={cn("flex-shrink-0 mt-0.5", theme.iconColor)} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-[var(--text)] leading-tight">{title}</h4>
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider", theme.badgeBg)}>
                {theme.badgeLabel}
              </span>
              {table && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface)] text-[var(--text-subtle)] border border-[var(--border)]">
                  {table}{column ? `.${column}` : ""}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{explanation}</p>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 space-y-3 text-xs">
        {whyItMatters && (
          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
              <Info size={13} className="text-[var(--primary)]" />
              <span>Why It Matters</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed">{whyItMatters}</p>
          </div>
        )}

        {suggestedSolution && (
          <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
              <Lightbulb size={13} className="text-amber-500" />
              <span>Suggested Solution</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed">{suggestedSolution}</p>
          </div>
        )}

        {sqlFix && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] font-sans flex items-center gap-1">
                <FileCode size={11} /> Suggested SQL Fix
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopySql}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                >
                  {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                  {copied ? "Copied" : "Copy SQL"}
                </button>
                {onOpenPlayground && (
                  <button
                    onClick={() => onOpenPlayground(sqlFix)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border border-[var(--primary-border,rgba(37,99,235,0.3))] text-[var(--primary)] bg-[var(--primary-light)] hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Play size={10} className="fill-current" />
                    Open in Playground
                  </button>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
              <SQLSyntaxHighlighter code={sqlFix} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AI SUGGESTION CARD
// ─────────────────────────────────────────────────────────────────────────────

export interface AISuggestionCardProps {
  title: string;
  suggestion: string;
  reason?: string;
  expectedBenefit?: string;
  sqlFix?: string;
  onOpenPlayground?: (sql: string) => void;
}

export function AISuggestionCard({
  title,
  suggestion,
  reason,
  expectedBenefit,
  sqlFix,
  onOpenPlayground,
}: AISuggestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopySql = async () => {
    if (!sqlFix) return;
    await navigator.clipboard.writeText(sqlFix);
    setCopied(true);
    toast.success("Fix SQL copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-xs hover:border-[var(--primary)]/40 transition-all">
      {/* Header compact summary */}
      <div className="flex items-start justify-between p-4 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--primary-light)] flex items-center justify-center flex-shrink-0 mt-0.5 text-[var(--primary)]">
            <Sparkles size={14} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-[var(--text)]">{title}</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-[var(--primary-border,rgba(37,99,235,0.3))] bg-[var(--primary-light)] text-[var(--primary)]">
                AI Suggestion
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{suggestion}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          <button
            onClick={() => setIsExpanded((v) => !v)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <span>Review</span>
            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {sqlFix && onOpenPlayground && (
            <button
              onClick={() => onOpenPlayground(sqlFix)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-[var(--primary-border,rgba(37,99,235,0.3))] text-[var(--primary)] bg-[var(--primary-light)] hover:opacity-90 transition-opacity cursor-pointer"
            >
              <Play size={11} className="fill-current" />
              Open in Playground
            </button>
          )}
        </div>
      </div>

      {/* Expanded Review Section */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="p-4 space-y-3 text-xs bg-[var(--card)] border-t border-[var(--border)]"
          >
            {reason && (
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <span className="font-bold text-[var(--text)] block mb-0.5">Reason:</span>
                <span className="text-[var(--text-muted)] leading-relaxed">{reason}</span>
              </div>
            )}

            {expectedBenefit && (
              <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <span className="font-bold text-[var(--text)] block mb-0.5">Expected Benefit:</span>
                <span className="text-[var(--text-muted)] leading-relaxed">{expectedBenefit}</span>
              </div>
            )}

            {sqlFix && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)] font-sans">
                    Code / SQL Fix
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleCopySql}
                      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
                    >
                      {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
                      {copied ? "Copied" : "Copy SQL"}
                    </button>
                    {onOpenPlayground && (
                      <button
                        onClick={() => onOpenPlayground(sqlFix)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border border-[var(--primary-border,rgba(37,99,235,0.3))] text-[var(--primary)] bg-[var(--primary-light)] hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Play size={10} className="fill-current" />
                        Open in Playground
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
                  <SQLSyntaxHighlighter code={sqlFix} />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXPLANATION RESPONSES CARD
// ─────────────────────────────────────────────────────────────────────────────

export interface ExplanationResponseCardProps {
  rawText: string;
}

export function parseExplanationText(text: string) {
  const lines = text.split("\n");
  const sectionContent: Record<string, string[]> = {
    purpose: [],
    tables: [],
    joins: [],
    filtering: [],
    grouping: [],
    performance: [],
    other: [],
  };

  let currentSection: "purpose" | "tables" | "joins" | "filtering" | "grouping" | "performance" | "other" = "purpose";

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    const lower = l.toLowerCase();
    if (lower.includes("purpose") || lower.includes("overview") || lower.includes("summary") || lower.includes("what it does")) {
      currentSection = "purpose";
      const cleaned = l.replace(/^(#+|\*\*|query purpose:?|overview:?|summary:?)/i, "").trim();
      if (cleaned) sectionContent.purpose.push(cleaned);
      continue;
    }
    if (lower.includes("table") && (lower.includes("involved") || lower.includes("used") || lower.includes("referenced") || lower.includes("from"))) {
      currentSection = "tables";
      const cleaned = l.replace(/^(#+|\*\*|tables involved:?|tables:?)/i, "").trim();
      if (cleaned) sectionContent.tables.push(cleaned);
      continue;
    }
    if (lower.includes("join") || lower.includes("relationship") || lower.includes("connecting")) {
      currentSection = "joins";
      const cleaned = l.replace(/^(#+|\*\*|join explanation:?|joins:?)/i, "").trim();
      if (cleaned) sectionContent.joins.push(cleaned);
      continue;
    }
    if (lower.includes("filter") || lower.includes("where") || lower.includes("having") || lower.includes("condition")) {
      currentSection = "filtering";
      const cleaned = l.replace(/^(#+|\*\*|filtering:?|where clause:?)/i, "").trim();
      if (cleaned) sectionContent.filtering.push(cleaned);
      continue;
    }
    if (lower.includes("group") || lower.includes("aggregat") || lower.includes("order by")) {
      currentSection = "grouping";
      const cleaned = l.replace(/^(#+|\*\*|grouping:?|group by:?)/i, "").trim();
      if (cleaned) sectionContent.grouping.push(cleaned);
      continue;
    }
    if (lower.includes("performance") || lower.includes("index") || lower.includes("optimiz") || lower.includes("scan")) {
      currentSection = "performance";
      const cleaned = l.replace(/^(#+|\*\*|performance notes:?|performance:?)/i, "").trim();
      if (cleaned) sectionContent.performance.push(cleaned);
      continue;
    }

    sectionContent[currentSection].push(l);
  }

  // Fallback for purpose if empty
  if (sectionContent.purpose.length === 0) {
    const firstPara = lines.find((l) => l.trim().length > 0 && !l.startsWith("-") && !l.startsWith("*"));
    if (firstPara) sectionContent.purpose.push(firstPara.trim());
  }

  // Extract table names
  const tableText = (sectionContent.tables.join(" ") + " " + text).slice(0, 1000);
  const foundTables = Array.from(tableText.matchAll(/`([a-zA-Z_][a-zA-Z0-9_]*)`/g))
    .map((m) => m[1])
    .filter((t) => !["select", "from", "where", "join", "group", "order", "table", "tables"].includes(t.toLowerCase()));

  return {
    queryPurpose: sectionContent.purpose.join(" ") || text.slice(0, 200),
    tablesInvolved: Array.from(new Set(foundTables)),
    joinExplanation: sectionContent.joins.join("\n"),
    filtering: sectionContent.filtering.join("\n"),
    grouping: sectionContent.grouping.join("\n"),
    performanceNotes: sectionContent.performance.join("\n"),
    otherContent: sectionContent.other.join("\n"),
  };
}

export function ExplanationResponseCard({ rawText }: ExplanationResponseCardProps) {
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => parseExplanationText(rawText), [rawText]);

  const handleCopyExplanation = async () => {
    await navigator.clipboard.writeText(rawText);
    setCopied(true);
    toast.success("Explanation copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden shadow-xs space-y-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <Search size={15} className="text-[var(--primary)]" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-subtle)] font-sans">
            SQL Explanation
          </h4>
        </div>
        <button
          onClick={handleCopyExplanation}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] bg-[var(--card)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-subtle)] transition-all cursor-pointer"
        >
          {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy Explanation"}
        </button>
      </div>

      {/* Visually Separated Sections */}
      <div className="p-4 space-y-3.5 text-xs">
        {/* 1. Query Purpose */}
        {parsed.queryPurpose && (
          <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
              <Zap size={14} className="text-[var(--primary)]" />
              <span>Query Purpose</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed">{parsed.queryPurpose}</p>
          </div>
        )}

        {/* 2. Tables Involved */}
        {parsed.tablesInvolved && parsed.tablesInvolved.length > 0 && (
          <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-2">
              <TableIcon size={14} className="text-blue-500" />
              <span>Tables Involved</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {parsed.tablesInvolved.map((tbl) => (
                <span
                  key={tbl}
                  className="px-2.5 py-1 rounded-md font-mono text-[11px] font-semibold bg-[var(--card)] text-[var(--text)] border border-[var(--border)]"
                >
                  {tbl}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 3. JOIN Explanation */}
        {parsed.joinExplanation && (
          <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
              <Link2 size={14} className="text-purple-500" />
              <span>JOIN Explanation</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
              {parsed.joinExplanation}
            </p>
          </div>
        )}

        {/* 4. Filtering */}
        {parsed.filtering && (
          <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
              <Filter size={14} className="text-emerald-500" />
              <span>Filtering</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
              {parsed.filtering}
            </p>
          </div>
        )}

        {/* 5. Grouping */}
        {parsed.grouping && (
          <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
              <Layers size={14} className="text-amber-500" />
              <span>Grouping</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
              {parsed.grouping}
            </p>
          </div>
        )}

        {/* 6. Performance Notes */}
        {parsed.performanceNotes && (
          <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-1.5 font-bold text-[var(--text)] mb-1">
              <Lightbulb size={14} className="text-indigo-500" />
              <span>Performance Notes</span>
            </div>
            <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
              {parsed.performanceNotes}
            </p>
          </div>
        )}

        {/* Fallback general prose if no specific breakdown section matched */}
        {!parsed.joinExplanation && !parsed.filtering && !parsed.grouping && !parsed.performanceNotes && (
          <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
            <p className="text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">{rawText}</p>
          </div>
        )}
      </div>
    </div>
  );
}
