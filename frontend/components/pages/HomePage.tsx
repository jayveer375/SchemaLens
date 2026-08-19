"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb } from "lucide-react";
import UploadArea from "@/components/UploadArea";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import ImagePreview from "@/components/ImagePreview";
import CodeEditor from "@/components/CodeEditor";
import StatsCards from "@/components/StatsCards";
import HowItWorks from "@/components/HowItWorks";
import ExamplePreview from "@/components/ExamplePreview";
import { useStore, AnalysisResult, HistoryEntry } from "@/lib/store";
import { parseSQLStats } from "@/lib/utils";
import toast from "react-hot-toast";

export default function HomePage() {
  const {
    appState, setAppState,
    currentResult, setCurrentResult,
    setError, addToHistory, reset,
    customColumns, globalPromptRules, autoApplyToAllTools,
  } = useStore();
  const activeCustomCols = (customColumns || []).filter((c) => c.enabled);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (f: File) => {
    // Create preview URL
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    const url = URL.createObjectURL(f);
    setImageUrl(url);
    setFile(f);
    setAppState("processing");
    setError(null);

    try {
      const form = new FormData();
      form.append("image", f);
      if (autoApplyToAllTools && activeCustomCols.length > 0) {
        form.append("customColumns", JSON.stringify(activeCustomCols));
      }
      if (autoApplyToAllTools && globalPromptRules) {
        form.append("customRules", globalPromptRules);
      }

      const t0 = Date.now();
      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok || !data.sql) {
        throw new Error(data.error ?? "Analysis failed");
      }

      const { tables, fks, cols } = parseSQLStats(data.sql);
      const processingTime = Date.now() - t0;

      const result: AnalysisResult = {
        id: `${Date.now()}`,
        filename: f.name,
        imageUrl: url,
        sql: data.sql,
        timestamp: Date.now(),
        processingTime,
        stats: {
          tables,
          relationships: fks,
          attributes: cols,
          confidence: 92, // AI engine does not expose raw confidence scores
          processingTime,
        },
      };

      setCurrentResult(result);
      setAppState("done");

      // Save to history
      const entry: HistoryEntry = {
        id: result.id,
        name: f.name.replace(/\.[^.]+$/, ""),
        timestamp: result.timestamp,
        imageUrl: url,
        sql: data.sql,
        stats: result.stats,
      };
      addToHistory(entry);
      toast.success("SQL generated successfully!");
    } catch (err: any) {
      setError(err.message);
      setAppState("error");
      toast.error(err.message || "Failed to analyze image");
    }
  }, [imageUrl, setAppState, setCurrentResult, setError, addToHistory]);

  const handleFile = (f: File) => processFile(f);
  const handleRegenerate = () => { if (file) processFile(file); };
  const handleRemove = () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setFile(null);
    reset();
  };
  const handleReplace = () => fileInputRef.current?.click();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const isProcessing = appState === "processing";
  const isDone = appState === "done" && !!currentResult;

  return (
    <div className="min-h-full">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        onChange={handleFileInputChange}
      />

      <AnimatePresence mode="wait">
        {/* ── IDLE: Upload screen ── */}
        {!isDone && appState !== "processing" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {/* Title */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-[var(--text)] mb-2">
                Convert ER Diagram to SQL
              </h1>
              <p className="text-[var(--text-muted)] text-base max-w-xl">
                Upload your ER diagram image and get database code instantly
              </p>
            </div>

            {/* Upload + How it works */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6 mb-8">
              <UploadArea onFile={handleFile} />
              <HowItWorks />
            </div>

            {/* Example */}
            <ExamplePreview />

            {/* Tip */}
            <div className="mt-6 flex items-center gap-2.5 px-4 py-3 rounded-xl
              bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
              <Lightbulb size={15} className="text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Tip:</span> Upload a clear ER diagram for better accuracy.
                Ensure entity names, attributes, and relationship lines are clearly visible.
              </p>
            </div>
          </motion.div>
        )}

        {/* ── PROCESSING: Loading screen ── */}
        {isProcessing && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center min-h-[500px] gap-6"
          >
            <div className="relative w-full max-w-sm card p-10">
              <ProcessingOverlay visible={true} />
            </div>
          </motion.div>
        )}

        {/* ── DONE: Workspace ── */}
        {isDone && currentResult && (
          <motion.div
            key="workspace"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[var(--text)]">
                  {currentResult.filename.replace(/\.[^.]+$/, "")}
                </h1>
                <p className="text-sm text-[var(--text-muted)] mt-0.5">
                  SQL generated successfully · Ready to use
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleRemove}
                className="btn-ghost text-sm"
              >
                New Analysis
              </motion.button>
            </div>

            {/* Two-column workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 mb-6">
              {/* Left: Image */}
              <div className="card p-4 min-h-[400px] flex flex-col">
                <ImagePreview
                  src={imageUrl!}
                  filename={currentResult.filename}
                  onReplace={handleReplace}
                  onRemove={handleRemove}
                />
              </div>

              {/* Right: Code editor */}
              <div className="card p-4 min-h-[400px] flex flex-col">
                <CodeEditor
                  sql={currentResult.sql}
                  onRegenerate={handleRegenerate}
                  isProcessing={isProcessing}
                />
              </div>
            </div>

            {/* Stats cards */}
            <StatsCards result={currentResult} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
