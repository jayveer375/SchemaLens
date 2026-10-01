"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Upload, FileCode, FileJson, Sparkles, CheckCircle,
  AlertTriangle, Database, Layers, ArrowRight, ShieldCheck,
} from "lucide-react";
import { genId, parseSQLStats } from "@/lib/utils";
import type { Project, ProjectFile, DBType } from "@/lib/types";
import toast from "react-hot-toast";

interface ImportProjectModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (project: Project) => Promise<void> | void;
  ownerId: string;
}

const DB_TYPES: { id: DBType; label: string }[] = [
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql",      label: "MySQL" },
  { id: "sqlite",     label: "SQLite" },
  { id: "mssql",      label: "SQL Server" },
  { id: "oracle",     label: "Oracle" },
];

function detectDialect(sql: string): DBType {
  const lower = sql.toLowerCase();
  if (lower.includes("engine=innodb") || lower.includes("auto_increment")) return "mysql";
  if (lower.includes("pragma foreign_keys") || (lower.includes("autoincrement") && !lower.includes("auto_increment"))) return "sqlite";
  if (lower.includes("datetime2") || lower.includes("nvarchar") || lower.includes("identity(1,1)")) return "mssql";
  if (lower.includes("varchar2") || lower.includes("number(") || lower.includes("systimestamp")) return "oracle";
  return "postgresql";
}

function extractStats(sql: string) {
  const { tables, fks, cols } = parseSQLStats(sql);
  return { tables, relationships: fks, attributes: cols };
}

export default function ImportProjectModal({
  open,
  onClose,
  onImport,
  ownerId,
}: ImportProjectModalProps) {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState("");
  const [detectedType, setDetectedType] = useState<"json" | "sql" | null>(null);

  // Editable project details
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [dbType, setDbType] = useState<DBType>("postgresql");
  const [importing, setImporting] = useState(false);
  const [parsedFiles, setParsedFiles] = useState<ProjectFile[]>([]);
  const [parseStats, setParseStats] = useState<{ tables: number; relationships: number; attributes: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setRawText("");
    setDetectedType(null);
    setProjectName("");
    setProjectDesc("");
    setDbType("postgresql");
    setParsedFiles([]);
    setParseStats(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processContent = (content: string, filename?: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("Content is empty");
      return;
    }

    // Try parsing as JSON first
    let isJson = false;
    try {
      const obj = JSON.parse(trimmed);
      isJson = true;
      setDetectedType("json");

      // Extract details
      const name = obj.name || (filename ? filename.replace(/\.[^/.]+$/, "") : "Imported Project");
      setProjectName(name);
      setProjectDesc(obj.description || "Imported from SchemaLens project backup");
      if (obj.dbType && DB_TYPES.some((d) => d.id === obj.dbType)) {
        setDbType(obj.dbType);
      }

      // Extract or reconstruct files
      let filesList: ProjectFile[] = [];
      if (Array.isArray(obj.files) && obj.files.length > 0) {
        filesList = obj.files.map((f: any, idx: number) => ({
          id: genId(),
          name: f.name || `schema_${idx + 1}.sql`,
          imageUrl: f.imageUrl || "",
          status: "completed" as const,
          sql: f.sql || "",
          uploadedAt: Date.now(),
          completedAt: Date.now(),
          stats: f.stats || (f.sql ? extractStats(f.sql) : { tables: 0, relationships: 0, attributes: 0 }),
        }));
      } else if (obj.sql) {
        filesList = [
          {
            id: genId(),
            name: `${name.toLowerCase().replace(/\s+/g, "_")}.sql`,
            imageUrl: "",
            status: "completed",
            sql: obj.sql,
            uploadedAt: Date.now(),
            completedAt: Date.now(),
            stats: extractStats(obj.sql),
          },
        ];
      }

      setParsedFiles(filesList);

      const totalStats = filesList.reduce(
        (acc, curr) => ({
          tables: acc.tables + (curr.stats?.tables || 0),
          relationships: acc.relationships + (curr.stats?.relationships || 0),
          attributes: acc.attributes + (curr.stats?.attributes || 0),
        }),
        { tables: 0, relationships: 0, attributes: 0 }
      );
      setParseStats(totalStats);
      toast.success(`Project structure parsed (${filesList.length} file${filesList.length !== 1 ? "s" : ""})`);
      return;
    } catch {
      // Not valid JSON, treated as SQL
      isJson = false;
    }

    // Treat as SQL
    setDetectedType("sql");
    const defaultName = filename
      ? filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      : "Imported SQL Project";
    setProjectName(defaultName);
    setProjectDesc("Imported from SQL DDL script");

    const detected = detectDialect(trimmed);
    setDbType(detected);

    const stats = extractStats(trimmed);
    setParseStats(stats);

    const filesList: ProjectFile[] = [
      {
        id: genId(),
        name: filename || `${defaultName.toLowerCase().replace(/\s+/g, "_")}.sql`,
        imageUrl: "",
        status: "completed",
        sql: trimmed,
        uploadedAt: Date.now(),
        completedAt: Date.now(),
        stats,
      },
    ];
    setParsedFiles(filesList);
    toast.success(`SQL parsed: ${stats.tables} tables, ${stats.relationships} relationships detected`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.match(/\.(json|sql|txt)$/i)) {
      toast.error("Please upload a .json or .sql file");
      return;
    }

    setFile(selected);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      processContent(content, selected.name);
    };
    reader.readAsText(selected);
  };

  const handleConfirmImport = async () => {
    if (!projectName.trim()) {
      toast.error("Project name is required");
      return;
    }
    if (parsedFiles.length === 0) {
      toast.error("No valid schema or project files to import");
      return;
    }

    setImporting(true);
    try {
      const now = Date.now();
      const newProject: Project = {
        id: genId(),
        ownerId,
        name: projectName.trim(),
        description: projectDesc.trim(),
        dbType,
        createdAt: now,
        updatedAt: now,
        files: parsedFiles,
        pinned: false,
      };

      await onImport(newProject);
      handleClose();
    } catch (err: any) {
      toast.error(err?.message || "Failed to import project");
    } finally {
      setImporting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-xl card p-0 overflow-hidden shadow-2xl my-8"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 via-primary-600 to-indigo-700 px-6 py-5 text-white">
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors"
              >
                <X size={16} className="text-white" />
              </button>

              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shadow-inner">
                  <Upload size={17} className="text-white" />
                </div>
                <h2 className="text-xl font-bold">Import Project</h2>
                <span className="badge bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 ml-2 border border-white/30">
                  Pro &amp; Ultimate
                </span>
              </div>
              <p className="text-white/80 text-xs sm:text-sm">
                Import existing project JSON backups or raw SQL schema scripts into your workspace.
              </p>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Mode Tabs */}
              <div className="flex rounded-xl bg-[var(--surface)] p-1 border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === "file"
                      ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <Upload size={14} /> Upload File (.json / .sql)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("paste")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === "paste"
                      ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <FileCode size={14} /> Paste SQL / JSON
                </button>
              </div>

              {/* Tab 1: File Upload */}
              {activeTab === "file" && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.sql,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[var(--border)] hover:border-primary-500 rounded-2xl p-6 text-center cursor-pointer transition-all hover:bg-[var(--surface)] group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                      {detectedType === "json" ? (
                        <FileJson size={24} />
                      ) : (
                        <Upload size={24} />
                      )}
                    </div>
                    {file ? (
                      <div>
                        <p className="text-sm font-bold text-[var(--text)]">{file.name}</p>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          {(file.size / 1024).toFixed(1)} KB · Click to change file
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">
                          Drop project file here or <span className="text-primary-600 underline">browse</span>
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          Supports SchemaLens <strong>.json</strong> exports or standard <strong>.sql</strong> DDL scripts
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Paste */}
              {activeTab === "paste" && (
                <div>
                  <textarea
                    value={rawText}
                    onChange={(e) => {
                      setRawText(e.target.value);
                      if (e.target.value.trim().length > 10) {
                        processContent(e.target.value);
                      }
                    }}
                    placeholder="Paste SQL schema (CREATE TABLE...) or SchemaLens project JSON backup here..."
                    rows={4}
                    className="w-full text-xs font-mono p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}

              {/* Detected Stats Banner */}
              {parseStats && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      Successfully parsed {parsedFiles.length} file ({parseStats.tables} tables, {parseStats.relationships} relationships, {parseStats.attributes} columns)
                    </span>
                  </div>
                  <span className="badge badge-emerald text-[10px] font-mono uppercase">
                    {detectedType?.toUpperCase()}
                  </span>
                </div>
              )}

              {/* Project Metadata Configuration Form */}
              <div className="space-y-3.5 pt-1">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] uppercase tracking-wider block mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., E-Commerce Core Database"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-[var(--text)] uppercase tracking-wider block mb-1">
                      Target Database
                    </label>
                    <div className="relative">
                      <select
                        value={dbType}
                        onChange={(e) => setDbType(e.target.value as DBType)}
                        className="w-full appearance-none px-3.5 py-2.5 pr-8 rounded-xl text-sm border border-[var(--border)] bg-[var(--card)] text-[var(--text)] font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {DB_TYPES.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <Database size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-[var(--text)] uppercase tracking-wider block mb-1">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={projectDesc}
                      onChange={(e) => setProjectDesc(e.target.value)}
                      placeholder="e.g., Relational schema with auth & billing"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn-ghost text-sm px-4 py-2.5"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || parsedFiles.length === 0 || !projectName.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold
                    bg-gradient-to-r from-violet-600 to-primary-600 text-white
                    hover:shadow-lg hover:shadow-primary-500/25 transition-all
                    disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles size={14} />
                  {importing ? "Importing…" : "Confirm & Import Project"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
