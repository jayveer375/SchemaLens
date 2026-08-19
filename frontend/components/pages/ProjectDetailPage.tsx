"use client";
import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft, Upload, FolderOpen, Image as ImageIcon, FileCode, FileText,
  FileJson, Loader2, CheckCircle, AlertTriangle, Clock, RefreshCw,
  Trash2, Download, Eye, ZoomIn, ZoomOut, Copy, ChevronRight, Database, Archive,
  Wand2, Sparkles, ChevronDown, ChevronUp, Lock,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { genId, parseSQLStats, downloadText, downloadJSON, formatDate } from "@/lib/utils";
import { canAddImage, canConvert, getPlan } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import type { ProjectFile } from "@/lib/types";
import UpgradeLimitDialog from "@/components/UpgradeLimitDialog";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { apiSaveProject } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then(m => m.default), {
  ssr: false, loading: () => <div className="p-6 space-y-2">{Array.from({length:10}).map((_,i)=><div key={i} className="skeleton h-4" style={{width:`${40+Math.random()*55}%`}}/>)}</div>
});

const STATUS_CONFIG = {
  waiting:    { label: "Waiting",    color: "text-gray-500",   bg: "bg-gray-50 dark:bg-gray-500/10",   icon: Clock },
  processing: { label: "Processing", color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-500/10", icon: Loader2 },
  completed:  { label: "Completed",  color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-500/10", icon: CheckCircle },
  failed:     { label: "Failed",     color: "text-red-600",    bg: "bg-red-50 dark:bg-red-500/10",     icon: AlertTriangle },
};

export default function ProjectDetailPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const {
    projects, activeProjectId, upsertFile, updateFileStatus, deleteFile, setActiveProject,
    theme, selectedLanguage, user, getSubscription, incrementConversions,
    customColumns, globalPromptRules, autoApplyToAllTools,
  } = useStore();
  const activeCustomCols = (customColumns || []).filter((c) => c.enabled);
  const ownerId = user?.id ?? "";
  const project = projects.find(p => p.id === activeProjectId && p.ownerId === ownerId);
  const [activeFolder, setActiveFolder] = useState<"images" | "sql" | "txt" | "json">("images");
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const queueRef = useRef<string[]>([]);

  // ── Generate from description state ────────────────────────────────────────
  const [genOpen, setGenOpen]           = useState(false);
  const [genDesc, setGenDesc]           = useState("");
  const [genStatus, setGenStatus]       = useState<"idle" | "processing" | "done" | "error">("idle");
  const [genError, setGenError]         = useState("");
  const [genStep, setGenStep]           = useState(0);
  const [zipping, setZipping]           = useState(false);

  const GEN_STEPS = ["Analyzing…", "Designing entities…", "Mapping relationships…", "Writing SQL…"];

  const selectedFile = project?.files.find(f => f.id === selectedFileId);

  // Save current project state (with all files) to PostgreSQL
  const syncToDb = useCallback(() => {
    const numericUserId = parseInt(user?.id ?? "", 10);
    if (!project || isNaN(numericUserId)) return;
    const latest = useStore.getState().projects.find(p => p.id === project.id);
    if (!latest) return;
    apiSaveProject({
      user_id: numericUserId, id: latest.id, name: latest.name,
      description: latest.description, db_type: latest.dbType,
      files: latest.files, pinned: latest.pinned ?? false,
    }).catch(() => {});
  }, [project, user]);

  const processQueue = useCallback(async () => {
    if (!project) return;
    const waiting = project.files.filter(f => f.status === "waiting").map(f => f.id);
    if (waiting.length === 0 || processing) return;
    setProcessing(true);

    for (const fileId of waiting) {
      if (!canConvert(getSubscription())) {
        setLimitOpen(true);
        break;
      }
      const file = useStore.getState().projects
        .find(p => p.id === project.id)?.files.find(f => f.id === fileId);
      if (!file || !file.imageUrl) continue;

      updateFileStatus(project.id, ownerId, fileId, { status: "processing" });
      try {
        const resp = await fetch(file.imageUrl);
        const blob = await resp.blob();
        const form = new FormData();
        form.append("image", blob, file.name);
        form.append("dialect", project.dbType);
        if (autoApplyToAllTools && activeCustomCols.length > 0) {
          form.append("customColumns", JSON.stringify(activeCustomCols));
        }
        if (autoApplyToAllTools && globalPromptRules) {
          form.append("customRules", globalPromptRules);
        }
        const t0 = Date.now();
        const res = await fetch("/api/analyze", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || !data.sql) throw new Error(data.error || "Analysis failed");
        const { tables, fks, cols } = parseSQLStats(data.sql);
        const pt = Date.now() - t0;
        updateFileStatus(project.id, ownerId, fileId, {
          status: "completed", sql: data.sql, processingTime: pt,
          completedAt: Date.now(),
          stats: { tables, relationships: fks, attributes: cols },
          versions: [{ sql: data.sql, generatedAt: Date.now() }],
        });
        incrementConversions();
        // ── Upload image to DB + save conversion with image_id ──
        const numericUserId = parseInt(user?.id ?? "", 10);
        if (!isNaN(numericUserId)) {
          const { apiUploadImage, apiSaveConversion, apiUpsertProjectImage } = await import("@/lib/api");
          // Upload image to images table (Quick Convert flow)
          const imageFile = new File([blob], file.name, { type: blob.type || "image/png" });
          let imageId: number | undefined;
          try {
            const uploaded = await apiUploadImage(numericUserId, imageFile);
            imageId = uploaded.image_id;
          } catch { /* non-fatal */ }
          // Save conversion
          apiSaveConversion({
            user_id: numericUserId, image_id: imageId, generated_ddl: data.sql,
            dialect: project.dbType, success: true,
            tables_count: tables, relationships_count: fks,
            execution_time_ms: pt, tool: "quick_convert",
          }).catch(() => {});
          // Update project_images table with SQL result
          apiUpsertProjectImage({
            image_uid: fileId, user_id: numericUserId, project_uid: project.id,
            original_filename: file.name, status: "completed",
            generated_sql: data.sql, tables_count: tables,
            relationships_count: fks, processing_time_ms: pt,
            completed_at: Date.now(),
          }).catch(() => {});
        }
        toast.success(`✓ ${file.name} processed`);
      } catch (err: any) {
        updateFileStatus(project.id, ownerId, fileId, { status: "failed", error: err.message });
        toast.error(`✗ ${file.name}: ${err.message}`);
      }
    }
    setProcessing(false);
    syncToDb();  // ← persist all file updates to PostgreSQL
  }, [project, processing, updateFileStatus, syncToDb]);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!project) return;
    const subscription = getSubscription();
    const available = Math.max(0, getPlan(subscription).maxImagesPerProject - project.files.length);
    const capacity = Math.min(available, accepted.length);
    if (!canAddImage(subscription, project.files.length) || capacity === 0) {
      setLimitOpen(true);
      return;
    }
    if (capacity < accepted.length) {
      setLimitOpen(true);
    }

    // Convert each file to base64 data URL so it persists in PostgreSQL
    const toBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    const newFiles: ProjectFile[] = await Promise.all(
      accepted.slice(0, capacity).map(async (f) => ({
        id: genId(),
        name: f.name,
        imageUrl: await toBase64(f),   // ← base64 data URL, survives page reload
        status: "waiting" as const,
        uploadedAt: Date.now(),
      }))
    );

    newFiles.forEach(f => upsertFile(project.id, ownerId, f));

    // ── Persist each image to project_images table in PostgreSQL ──────────
    const numericUserId = parseInt(user?.id ?? "", 10);
    if (!isNaN(numericUserId)) {
      const { apiUpsertProjectImage } = await import("@/lib/api");
      newFiles.forEach(f => {
        const base64Data = f.imageUrl?.startsWith("data:") ? f.imageUrl : undefined;
        const mimeMatch  = base64Data?.match(/^data:(.*?);base64,/);
        const mimeType   = mimeMatch?.[1] ?? "image/png";
        const byteLen    = base64Data ? Math.round((base64Data.length * 3) / 4) : undefined;
        apiUpsertProjectImage({
          image_uid: f.id, user_id: numericUserId, project_uid: project.id,
          original_filename: f.name, mime_type: mimeType, file_size_bytes: byteLen,
          image_data: base64Data, status: "waiting",
        }).catch(() => {});
      });
    }

    toast.success(`${newFiles.length} file${newFiles.length > 1 ? "s" : ""} added to queue`);
    // Auto-process after a short delay
    setTimeout(() => {
      const state = useStore.getState();
      const updatedProject = state.projects.find(p => p.id === project.id);
      if (updatedProject) processQueue();
    }, 300);
  }, [project, upsertFile, processQueue, getSubscription, ownerId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] },
    multiple: true,
  });

  const regenerate = async (file: ProjectFile) => {
    if (!project) return;
    updateFileStatus(project.id, ownerId, file.id, { status: "processing" });
    try {
      const resp = await fetch(file.imageUrl);
      const blob = await resp.blob();
      const form = new FormData();
      form.append("image", blob, file.name);
      form.append("dialect", project.dbType);
      if (autoApplyToAllTools && activeCustomCols.length > 0) {
        form.append("customColumns", JSON.stringify(activeCustomCols));
      }
      if (autoApplyToAllTools && globalPromptRules) {
        form.append("customRules", globalPromptRules);
      }
      const t0 = Date.now();
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.sql) throw new Error(data.error || "Failed");
      const { tables, fks, cols } = parseSQLStats(data.sql);
      const prev = file.versions || [];
      updateFileStatus(project.id, ownerId, file.id, {
        status: "completed", sql: data.sql, processingTime: Date.now() - t0,
        completedAt: Date.now(), stats: { tables, relationships: fks, attributes: cols },
        versions: [...prev, { sql: data.sql, generatedAt: Date.now() }],
      });
      syncToDb();  // ← save to PostgreSQL
      toast.success("Regenerated!");
    } catch (err: any) {
      updateFileStatus(project.id, ownerId, file.id, { status: "failed", error: err.message });
      toast.error(err.message);
    }
  };

  // ── Generate from description ──────────────────────────────────────────────
  const generateFromDescription = useCallback(async () => {
    if (!project || !genDesc.trim()) return;
    if (!canConvert(getSubscription())) { setLimitOpen(true); return; }

    setGenStatus("processing");
    setGenError("");
    setGenStep(0);
    const stepId = setInterval(() => setGenStep(s => Math.min(s + 1, GEN_STEPS.length - 1)), 1400);

    try {
      const t0 = Date.now();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: genDesc.trim(),
          dialect: project.dbType,
          customColumns: autoApplyToAllTools ? activeCustomCols : [],
          customRules: autoApplyToAllTools ? globalPromptRules : "",
        }),
      });
      const data = await res.json();
      clearInterval(stepId);
      if (!res.ok || !data.sql) throw new Error(data.error || "Generation failed");

      const { tables, fks, cols } = parseSQLStats(data.sql);
      const safeName = genDesc.trim().slice(0, 30).replace(/\s+/g, "_").toLowerCase();
      upsertFile(project.id, ownerId, {
        id: genId(), name: `${safeName}.sql`, imageUrl: "",
        status: "completed", sql: data.sql,
        uploadedAt: Date.now(), completedAt: Date.now(),
        processingTime: Date.now() - t0,
        stats: { tables, relationships: fks, attributes: cols },
      });
      incrementConversions();
      // ── Save to conversions table in DB ──
      const numericUid = parseInt(user?.id ?? "", 10);
      if (!isNaN(numericUid)) {
        const { apiSaveConversion } = await import("@/lib/api");
        apiSaveConversion({
          user_id: numericUid, generated_ddl: data.sql,
          dialect: project.dbType, success: true,
          tables_count: tables, relationships_count: fks,
          execution_time_ms: Date.now() - t0, tool: "generate",
        }).catch(() => {});
      }
      setGenStatus("done");
      syncToDb();  // ← save to PostgreSQL
      toast.success("Schema generated and saved to project!");
      setTimeout(() => { setGenOpen(false); setGenStatus("idle"); setGenDesc(""); setActiveFolder("sql"); }, 1200);
    } catch (err: any) {
      clearInterval(stepId);
      setGenError(err.message || "Generation failed");
      setGenStatus("error");
      toast.error(err.message || "Generation failed");
    }
  }, [project, genDesc, getSubscription, upsertFile, ownerId, incrementConversions]);

  // ── Export project as ZIP (Pro only) ──────────────────────────────────────
  const exportZip = useCallback(async () => {
    if (!project) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const sqlFolder  = zip.folder("sql")!;
      const txtFolder  = zip.folder("txt")!;
      const jsonFolder = zip.folder("json")!;

      project.files.forEach(f => {
        const base = f.name.replace(/\.[^.]+$/, "");
        if (f.sql) {
          sqlFolder.file(`${base}.sql`, f.sql);
          txtFolder.file(`${base}.txt`, f.sql);
          jsonFolder.file(`${base}.json`, JSON.stringify({
            filename: f.name,
            sql: f.sql,
            stats: f.stats ?? null,
            generatedAt: f.completedAt ?? null,
            project: project.name,
            dbType: project.dbType,
          }, null, 2));
        }
      });

      // Add a project manifest
      zip.file("manifest.json", JSON.stringify({
        project: project.name,
        description: project.description || "",
        dbType: project.dbType,
        exportedAt: new Date().toISOString(),
        files: project.files.map(f => ({
          name: f.name,
          status: f.status,
          tables: f.stats?.tables ?? 0,
          relationships: f.stats?.relationships ?? 0,
        })),
      }, null, 2));

      const blob = await zip.generateAsync({ type: "blob" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${project.name.replace(/\s+/g, "_")}_export.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Project exported as ZIP!");
    } catch (err: any) {
      toast.error("ZIP export failed: " + err.message);
    } finally {
      setZipping(false);
    }
  }, [project]);

  if (!project) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <p className="text-[var(--text-muted)]">Project not found.</p>
      <button onClick={() => onNavigate("projects")} className="btn-ghost text-sm"><ArrowLeft size={14}/> Back</button>
    </div>
  );

  const imageFiles = project.files;
  const sqlFiles   = project.files.filter(f => f.sql);
  const folderFiles = activeFolder === "images" ? imageFiles : activeFolder === "sql" ? sqlFiles : sqlFiles;
  const sub    = getSubscription();
  const isPro  = sub.planId === "pro";
  const hasSql = sqlFiles.length > 0;

  return (
    <div>
      {/* Breadcrumb + ZIP export */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <button onClick={() => onNavigate("projects")} className="hover:text-[var(--text)] transition-colors flex items-center gap-1">
            <ArrowLeft size={14}/> Projects
          </button>
          <ChevronRight size={13}/>
          <span className="font-semibold text-[var(--text)]">{project.name}</span>
          <span className="badge badge-emerald text-[10px] ml-1">{project.dbType}</span>
        </div>

        {/* ZIP Export button — Pro only */}
        {isPro ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={exportZip}
            disabled={zipping || !hasSql}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
              bg-[var(--card)] border border-[var(--border)] text-[var(--text)]
              hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all
              disabled:opacity-50 disabled:cursor-not-allowed"
            title={!hasSql ? "No SQL files to export" : "Export project as ZIP"}
          >
            {zipping ? (
              <><Loader2 size={14} className="animate-spin" /> Exporting…</>
            ) : (
              <><Archive size={14} /> Export ZIP</>
            )}
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={() => onNavigate("pricing")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
              bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30
              text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all"
            title="Upgrade to Pro to export as ZIP"
          >
            <Lock size={13} /> Export ZIP
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 dark:bg-amber-500/30 text-amber-700 dark:text-amber-300 ml-0.5">PRO</span>
          </motion.button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5">
        {/* LEFT: Folder sidebar */}
        <div className="space-y-4">
          {/* Upload zone */}
          <div {...(getRootProps() as any)}
            className={cn("upload-zone flex flex-col items-center justify-center gap-3 py-8 px-4 text-center cursor-pointer",
              isDragActive && "drag-over")}>
            <input {...getInputProps()} />
            <motion.div animate={isDragActive ? { scale: 1.15 } : { scale: 1 }}
              className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
              <Upload size={18} className="text-primary-600" />
            </motion.div>
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">{isDragActive ? "Drop to upload" : "Upload Images"}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">PNG, JPG, WEBP · Multiple files OK</p>
            </div>
          </div>

          {/* Generate from description */}
          <div className="card overflow-hidden">
            <button
              onClick={() => { setGenOpen(!genOpen); setGenStatus("idle"); setGenError(""); }}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[var(--surface)] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                  <Wand2 size={14} className="text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-[var(--text)]">Generate from Text</span>
              </div>
              {genOpen ? <ChevronUp size={14} className="text-[var(--text-muted)]" /> : <ChevronDown size={14} className="text-[var(--text-muted)]" />}
            </button>

            <AnimatePresence>
              {genOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-[var(--border)]"
                >
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-[var(--text-muted)]">
                      Describe your schema in plain English and AI will generate SQL for this project.
                    </p>
                    <textarea
                      value={genDesc}
                      onChange={(e) => setGenDesc(e.target.value)}
                      disabled={genStatus === "processing"}
                      placeholder={`e.g. Students, courses, and enrollments for a university…`}
                      rows={3}
                      className="w-full resize-none text-xs rounded-xl border border-[var(--border)]
                        bg-[var(--surface)] text-[var(--text)] placeholder:text-[var(--text-subtle)]
                        px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500/20
                        focus:border-primary-500 transition-all disabled:opacity-50"
                    />

                    {genStatus === "processing" && (
                      <div className="flex items-center gap-2.5 text-xs text-[var(--text-muted)]">
                        <span className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                        <AnimatePresence mode="wait">
                          <motion.span key={genStep}
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}>
                            {GEN_STEPS[genStep]}
                          </motion.span>
                        </AnimatePresence>
                      </div>
                    )}

                    {genStatus === "done" && (
                      <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold">
                        <CheckCircle size={13} /> Schema saved to project!
                      </div>
                    )}

                    {genStatus === "error" && (
                      <div className="flex items-center gap-2 text-xs text-red-500">
                        <AlertTriangle size={13} /> {genError}
                      </div>
                    )}

                    <button
                      onClick={generateFromDescription}
                      disabled={genStatus === "processing" || !genDesc.trim()}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                        text-sm font-semibold bg-gradient-to-r from-emerald-600 to-primary-600
                        text-white hover:shadow-lg hover:shadow-emerald-500/25 transition-all
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      {genStatus === "processing" ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <><Sparkles size={13} /> Generate Schema</>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Folder navigation */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border)]">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Folders</p>
            </div>
            {[
              { id: "images", label: "Images", icon: ImageIcon, count: project.files.length },
              { id: "sql",    label: "SQL",    icon: FileCode,  count: sqlFiles.length },
              { id: "txt",    label: "TXT",    icon: FileText,  count: sqlFiles.length },
              { id: "json",   label: "JSON",   icon: FileJson,  count: sqlFiles.length },
            ].map(({ id, label, icon: Icon, count }) => (
              <button key={id} onClick={() => setActiveFolder(id as any)}
                className={cn("w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors border-b border-[var(--border)] last:border-none",
                  activeFolder === id ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 font-semibold"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]")}>
                <Icon size={15} className="flex-shrink-0" />
                <span className="flex-1 text-left">{label}</span>
                <span className="text-[10px] font-bold bg-[var(--border)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">{count}</span>
              </button>
            ))}
          </div>

          {/* Processing queue */}
          {project.files.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Queue</p>
                {project.files.some(f => f.status === "waiting") && (
                  <button onClick={processQueue} disabled={processing}
                    className="btn-primary text-[10px] px-2.5 py-1 disabled:opacity-60">
                    {processing ? "Processing…" : "Process All"}
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)]">
                {project.files.map(f => {
                  const cfg = STATUS_CONFIG[f.status];
                  const Ic = cfg.icon;
                  return (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 group">
                      <div className={cn("w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0", cfg.bg)}>
                        <Ic size={12} className={cn(cfg.color, f.status === "processing" && "animate-spin")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[var(--text)] truncate">{f.name}</p>
                        <p className={cn("text-[10px]", cfg.color)}>{cfg.label}</p>
                      </div>
                      <button onClick={() => deleteFile(project.id, ownerId, f.id)}
                        className="w-5 h-5 rounded flex items-center justify-center text-[var(--text-subtle)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: File viewer */}
        <div className="space-y-4">
          {/* File list for active folder */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
              <h3 className="text-sm font-bold text-[var(--text)] capitalize">{activeFolder} Files</h3>
              <span className="text-xs text-[var(--text-muted)]">{folderFiles.length} files</span>
            </div>
            {folderFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <FolderOpen size={28} className="text-[var(--text-subtle)]" />
                <p className="text-sm text-[var(--text-muted)]">
                  {activeFolder === "images" ? "No images uploaded yet" : "No generated files yet"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)] max-h-52 overflow-y-auto">
                {folderFiles.map(f => {
                  const cfg = STATUS_CONFIG[f.status];
                  const Ic = cfg.icon;
                  const baseName = f.name.replace(/\.[^.]+$/, "");
                  const displayName = activeFolder === "sql" ? `${baseName}.sql`
                    : activeFolder === "txt" ? `${baseName}.txt`
                    : activeFolder === "json" ? `${baseName}.json` : f.name;
                  return (
                    <button key={f.id} onClick={() => setSelectedFileId(f.id === selectedFileId ? null : f.id)}
                      className={cn("w-full flex items-center gap-3 px-5 py-3 hover:bg-[var(--surface)] transition-colors text-left",
                        selectedFileId === f.id && "bg-primary-50 dark:bg-primary-900/20")}>
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", cfg.bg)}>
                        <Ic size={13} className={cn(cfg.color, f.status === "processing" && "animate-spin")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text)] truncate">{displayName}</p>
                        <p className="text-[10px] text-[var(--text-subtle)]">{f.stats ? `${f.stats.tables} tables · ${f.stats.relationships} FKs` : cfg.label}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {f.sql && (
                          <>
                            <button onClick={e => { e.stopPropagation(); downloadText(f.sql!, `${baseName}.sql`); }}
                              title="Download SQL" className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors">
                              <Download size={12} />
                            </button>
                            <button onClick={e => { e.stopPropagation(); regenerate(f); }}
                              title="Regenerate" className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors">
                              <RefreshCw size={12} />
                            </button>
                          </>
                        )}
                        <button onClick={e => { e.stopPropagation(); deleteFile(project.id, ownerId, f.id); toast.success("Deleted"); }}
                          className="w-6 h-6 rounded flex items-center justify-center text-[var(--text-subtle)] hover:text-red-500 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview pane */}
          <AnimatePresence>
            {selectedFile && (
              <motion.div key={selectedFile.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)]">
                  <h3 className="text-sm font-bold text-[var(--text)] truncate max-w-[240px]">{selectedFile.name}</h3>
                  <div className="flex items-center gap-1">
                    {activeFolder === "images" && selectedFile.imageUrl ? (
                      <>
                        <button onClick={() => setZoom(z => Math.min(z + 0.25, 3))} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors"><ZoomIn size={14}/></button>
                        <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors"><ZoomOut size={14}/></button>
                        <button onClick={() => setZoom(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors"><RefreshCw size={13}/></button>
                      </>
                    ) : selectedFile.sql ? (
                      <>
                        <button onClick={() => { navigator.clipboard.writeText(selectedFile.sql!); toast.success("Copied!"); }}
                          className="btn-ghost text-xs px-3 py-1.5"><Copy size={12}/> Copy</button>
                        <button onClick={() => downloadText(selectedFile.sql!, `${selectedFile.name.replace(/\.[^.]+$/,"")}.sql`)}
                          className="btn-ghost text-xs px-3 py-1.5"><Download size={12}/> SQL</button>
                        <button onClick={() => downloadText(selectedFile.sql!, `${selectedFile.name.replace(/\.[^.]+$/,"")}.txt`)}
                          className="btn-ghost text-xs px-3 py-1.5"><FileText size={12}/> TXT</button>
                        <button onClick={() => downloadJSON({ filename: selectedFile.name, sql: selectedFile.sql, stats: selectedFile.stats, generatedAt: selectedFile.completedAt }, `${selectedFile.name.replace(/\.[^.]+$/,"")}.json`)}
                          className="btn-ghost text-xs px-3 py-1.5"><FileJson size={12}/> JSON</button>
                      </>
                    ) : null}
                  </div>
                </div>

                {activeFolder === "images" ? (
                  selectedFile.imageUrl ? (
                    <div className="flex items-center justify-center p-6 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.015)_10px,rgba(0,0,0,0.015)_20px)] min-h-[240px] overflow-auto">
                      <img src={selectedFile.imageUrl} alt={selectedFile.name}
                        style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 0.2s ease" }}
                        className="max-w-full object-contain rounded-lg shadow-card" draggable={false} />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 min-h-[240px] py-10 px-6 text-center
                      bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.015)_10px,rgba(0,0,0,0.015)_20px)]">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                        <Wand2 size={28} className="text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">AI Generated Schema</p>
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          This file was generated from a text description — no source image.
                        </p>
                      </div>
                      {selectedFile.sql && (
                        <button
                          onClick={() => { setActiveFolder("sql"); }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                            bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border border-emerald-200
                            dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                        >
                          <FileCode size={14} /> View SQL
                        </button>
                      )}
                    </div>
                  )
                ) : selectedFile.sql ? (
                  <div className="h-80">
                    <MonacoEditor height="100%" language="sql" value={selectedFile.sql}
                      theme={theme === "dark" ? "vs-dark" : "light"}
                      options={{ readOnly: true, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", minimap: { enabled: false }, lineNumbers: "on", scrollBeyondLastLine: false, wordWrap: "on", padding: { top: 12, bottom: 12 }, scrollbar: { verticalScrollbarSize: 5 } }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-16">
                    <div className="text-center">
                      {selectedFile.status === "processing" ? (
                        <><Loader2 size={28} className="text-amber-500 animate-spin mx-auto mb-2"/><p className="text-sm text-[var(--text-muted)]">Processing…</p></>
                      ) : selectedFile.status === "failed" ? (
                        <><AlertTriangle size={28} className="text-red-500 mx-auto mb-2"/>
                          <p className="text-sm text-red-500 mb-2">{selectedFile.error || "Failed"}</p>
                          <button onClick={() => regenerate(selectedFile)} className="btn-ghost text-xs"><RefreshCw size={12}/> Retry</button>
                        </>
                      ) : (
                        <><Clock size={28} className="text-[var(--text-subtle)] mx-auto mb-2"/><p className="text-sm text-[var(--text-muted)]">Waiting in queue…</p></>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <UpgradeLimitDialog
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        reason="images"
        onNavigatePricing={() => onNavigate("pricing")}
      />
    </div>
  );
}
