"use client";
import { useState, useRef } from "react";
import {
  Sparkles, Lock, Upload, FileText, Type, Image as ImageIcon,
  Loader2, AlertCircle, Check, Copy, Download, Trash2, RefreshCw,
  Database, LayoutGrid, Crown, Zap, ArrowLeft
} from "lucide-react";
import { useStore } from "@/lib/store";
import toast from "react-hot-toast";
import { InlineDiagramViewer } from "@/components/ERDiagramModal";
import type { DiagramType } from "@/components/ERDiagramModal";
import LockedFeatureScreen from "@/components/LockedFeatureScreen";
import { getAvailableD2DDiagramTypes, canUseD2DSQL } from "@/lib/feature-restrictions";

interface D2DPageProps { 
  onNavigate?: (page: string) => void; 
  onNavigateBack?: () => void;
}
type InputMode = "text" | "document" | "image";
type ViewMode  = "diagram" | "sql";

const DIAGRAM_TYPES = [
  { key: "er",        label: "ER Diagram",    desc: "Entities & relationships", erType: "er"        as DiagramType },
  { key: "flowchart", label: "Flowchart",     desc: "Process & decision flow",  erType: "flowchart" as DiagramType },
  { key: "dfd",       label: "Data Flow DFD", desc: "Data movement & stores",   erType: "dfd1"      as DiagramType },
  { key: "class",     label: "Class Diagram", desc: "OOP class structure",       erType: "class"     as DiagramType },
];

const SQL_DIALECTS = [
  { key: "postgresql", label: "PostgreSQL" },
  { key: "mysql",      label: "MySQL"      },
  { key: "sqlite",     label: "SQLite"     },
  { key: "mssql",      label: "SQL Server" },
];

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// Plan-based feature access component
const LockedFeatureCard = ({ feature, requiredPlan, onUpgrade }: { 
  feature: string; 
  requiredPlan: "pro" | "ultimate";
  onUpgrade: () => void;
}) => (
  <div className="relative">
    <div className="p-3 border border-gray-300 rounded-lg bg-gray-50 opacity-60">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">{feature}</span>
        <Lock className="h-4 w-4 text-gray-400" />
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Requires {requiredPlan === "pro" ? "Pro" : "Ultimate"} plan
      </p>
    </div>
    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-lg cursor-pointer" onClick={onUpgrade}>
      <div className="bg-white px-3 py-1.5 rounded-md shadow-md flex items-center gap-2 hover:bg-gray-50">
        <Crown className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-medium">Upgrade</span>
      </div>
    </div>
  </div>
);

export default function D2DPage({ onNavigate, onNavigateBack }: D2DPageProps) {
  const {
    subscription, diagramUid, recommendedTypes, selectedType, mermaidCode,
    isAnalyzing, d2dIsGenerating: isGenerating, d2dError: error,
    setDiagramUid, setRecommendedTypes, setSelectedType,
    setMermaidCode, setIsAnalyzing, setIsGenerating, setD2DError: setError,
    addDiagram, clearD2DState, theme, upgradeToPlan,
  } = useStore();

  // Get available diagram types based on user's plan
  const { available: availableDiagramTypes, locked: lockedDiagramTypes } = getAvailableD2DDiagramTypes(subscription);
  
  // Check SQL generation access
  const sqlAccess = canUseD2DSQL(subscription);
  
  const handleUpgrade = (requiredPlan: "pro" | "ultimate") => {
    if (requiredPlan === "pro") {
      upgradeToPlan("pro");
      toast.success("Upgraded to Pro! All features unlocked.");
    } else {
      upgradeToPlan("ultimate"); 
      toast.success("Upgraded to Ultimate! All features unlocked.");
    }
  };

  const [inputMode, setInputMode]       = useState<InputMode>("text");
  const [text, setText]                 = useState("");
  const [file, setFile]                 = useState<File | null>(null);
  const [filePreview, setFilePreview]   = useState<string | null>(null);
  const [viewMode, setViewMode]         = useState<ViewMode>("diagram");
  const [copiedSql, setCopiedSql]       = useState(false);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [sqlDialect, setSqlDialect]     = useState("postgresql");
  const [sqlCode, setSqlCode]           = useState("");
  const [isGenSql, setIsGenSql]         = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const isPremium = subscription?.planId === "pro";
  const isDark = theme === "dark";
  const isWorking = isAnalyzing || isGenerating;

  // ── helpers ─────────────────────────────────────────────────────────────
  const handleFileChange = (f: File | null) => {
    if (!f) { setFile(null); setFilePreview(null); return; }
    if (f.size > MAX_FILE_SIZE) { toast.error("File too large (max 5 MB)"); return; }
    if (inputMode === "image" && !ALLOWED_IMG.includes(f.type)) { toast.error("Unsupported image type"); return; }
    setFile(f);
    if (inputMode === "image") {
      const r = new FileReader();
      r.onload = e => setFilePreview(e.target?.result as string);
      r.readAsDataURL(f);
    }
  };

  const extractFileText = async (f: File) => {
    try {
      if (f.type.startsWith("image/")) return `Image file: ${f.name}`;
      return `File: ${f.name}\n\n${(await f.text()).slice(0, 4000)}`;
    } catch { return `File: ${f.name}`; }
  };

  const getContent = async () =>
    inputMode === "text" ? text : file ? await extractFileText(file) : "";

  // ── generate SQL (core action) ───────────────────────────────────────────
  const generateSQL = async (content: string, extracted: any, diagType: string, dialect = sqlDialect): Promise<string | null> => {
    const res = await fetch("/api/d2d/generate-sql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: content.slice(0, 1500),
        text: content.slice(0, 1500),
        dialect,
        diagram_type: diagType,
        extracted: extracted || {},
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "SQL generation failed");
    return data.sql || null;
  };

  // ── analyze + auto generate ──────────────────────────────────────────────
  const handleAnalyzeAndGenerate = async () => {
    if (inputMode === "text" && !text.trim()) { toast.error("Enter some text first"); return; }
    if (inputMode !== "text" && !file) { toast.error("Upload a file first"); return; }

    setIsAnalyzing(true); setError(null); setMermaidCode(null); setSqlCode(""); setExtractedData(null);

    try {
      const content = await getContent();

      // Step 1: Analyze with Mistral to extract entities/relationships
      const fd = new FormData(); fd.append("text", content);
      const r1 = await fetch("/api/d2d/analyze-text", { method: "POST", body: fd });
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error || "Analysis failed");

      // Filter to only our 4 supported types
      const validKeys = DIAGRAM_TYPES.map(d => d.key);
      const raw: string[] = d1.recommended_types || [];
      const mapped = raw.map(t => {
        if (t === "schema") return "er";
        if (["activity","process","state","sequence","usecase"].includes(t)) return "flowchart";
        if (["architecture","component","network"].includes(t)) return "dfd";
        return validKeys.includes(t) ? t : null;
      }).filter(Boolean) as string[];
      const types = [...new Set(mapped)];
      const best = types[0] || "er";

      setRecommendedTypes(types.length ? types : [best]);
      setExtractedData(d1.extracted || {});
      setSelectedType(best);
      setDiagramUid(`local-${Date.now()}`);
      setIsAnalyzing(false);
      setIsGenerating(true);

      // Step 2: Generate SQL directly (powers the interactive diagram)
      const sql = await generateSQL(content, d1.extracted || {}, best);
      if (sql) {
        setSqlCode(sql);
        setMermaidCode(sql); // InlineDiagramViewer uses SQL
      }

      setViewMode("diagram");
      addDiagram({ diagram_uid: `local-${Date.now()}`, diagram_type: best, created_at: new Date().toISOString() });
      toast.success(`${DIAGRAM_TYPES.find(d => d.key === best)?.label} generated!`);
    } catch (e: any) {
      setError(e.message); toast.error(e.message || "Failed");
    } finally {
      setIsAnalyzing(false); setIsGenerating(false);
    }
  };

  // ── switch diagram type ──────────────────────────────────────────────────
  const handleGenerate = async (type?: string) => {
    const useType = type || selectedType || "er";
    setIsGenerating(true); setError(null); setSqlCode("");
    try {
      const content = await getContent();
      const sql = await generateSQL(content, extractedData, useType);
      if (sql) { setSqlCode(sql); setMermaidCode(sql); }
      setSelectedType(useType); setViewMode("diagram");
      toast.success(`${DIAGRAM_TYPES.find(d => d.key === useType)?.label} generated!`);
    } catch (e: any) { setError(e.message); toast.error(e.message || "Failed"); }
    finally { setIsGenerating(false); }
  };

  // ── generate SQL DDL in chosen dialect ───────────────────────────────────
  const handleGenerateSQL = async () => {
    const content = await getContent();
    if (!content && !extractedData) { toast.error("Generate a diagram first"); return; }
    setIsGenSql(true); setSqlCode("");
    try {
      const sql = await generateSQL(content || text, extractedData, selectedType || "er", sqlDialect);
      if (sql) {
        setSqlCode(sql);
        if (sql.includes("CREATE TABLE")) setMermaidCode(sql);
        toast.success(`${SQL_DIALECTS.find(d => d.key === sqlDialect)?.label} SQL generated!`);
      }
    } catch (e: any) { toast.error(e.message || "SQL generation failed"); }
    finally { setIsGenSql(false); }
  };

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(sqlCode);
    setCopiedSql(true); toast.success("Copied!"); setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleDownloadSql = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([sqlCode], { type: "text/plain" }));
    a.download = `schema-${sqlDialect}.sql`; a.click();
    toast.success("Downloaded!");
  };

  const handleReset = () => {
    clearD2DState(); setText(""); setFile(null); setFilePreview(null);
    setExtractedData(null); setSqlCode("");
  };

  const selectedMeta = DIAGRAM_TYPES.find(d => d.key === selectedType);
  const hasSql = (sqlCode || mermaidCode || "").includes("CREATE TABLE");
  const diagramSQL = hasSql ? (sqlCode || mermaidCode || "") : "";
  const erType = selectedMeta?.erType || "er";

  // ── premium gate ─────────────────────────────────────────────────────────
  if (!isPremium) {
    return (
      <LockedFeatureScreen
        title="Document to Diagram"
        description="D2D converts any text, document, or image into interactive diagrams powered by AI."
        features={[
          { icon: "", text: "Interactive ER Diagram" },
          { icon: "", text: "Flowchart" },
          { icon: "", text: "DFD" },
          { icon: "", text: "Class Diagram" },
          { icon: "", text: "SQL DDL export" },
          { icon: "", text: "PostgreSQL / MySQL / SQLite" },
          { icon: "", text: "Draggable nodes" },
          { icon: "", text: "PNG export" },
        ]}
        requiredPlan="pro"
        upgradePrice="₹199 / month"
        onNavigateBack={onNavigateBack}
        onUpgrade={() => onNavigate?.("pricing")}
      />
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-1 pb-16">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {/* Back Button */}
          {onNavigateBack && (
            <button
              onClick={onNavigateBack}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
              title="Go back"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          )}
          
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-xl font-bold">Document to Diagram</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 rounded-full border border-violet-200 dark:border-violet-700 uppercase tracking-wider">Pro</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 ml-10">AI converts your text, docs or images into interactive diagrams + SQL</p>
          </div>
        </div>
        {mermaidCode && (
          <button onClick={handleReset} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-300">
            <Trash2 className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Input tabs */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex border-b border-gray-100 dark:border-gray-800">
              {([
                { mode: "text"     as InputMode, Icon: Type,      label: "Text"     },
                { mode: "document" as InputMode, Icon: FileText,  label: "Document" },
                { mode: "image"    as InputMode, Icon: ImageIcon, label: "Image"    },
              ]).map(({ mode, Icon, label }) => (
                <button key={mode}
                  onClick={() => { setInputMode(mode); setFile(null); setFilePreview(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition border-b-2
                    ${inputMode === mode
                      ? "text-violet-600 dark:text-violet-300 border-violet-500 bg-violet-50/60 dark:bg-violet-900/20"
                      : "text-gray-500 border-transparent hover:text-gray-700 dark:hover:text-gray-300"}`}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {inputMode === "text" && (
                <>
                  <textarea value={text} onChange={e => setText(e.target.value.slice(0, 5000))} disabled={isWorking}
                    placeholder="Paste requirements, SRS docs, API specs, database descriptions, user stories..."
                    className="w-full h-44 p-3 text-sm border border-gray-200 dark:border-gray-700 rounded-xl dark:bg-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 transition placeholder:text-gray-400 leading-relaxed" />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-xs text-gray-400">SRS / specs / requirements / schema docs</span>
                    <span className={`text-xs font-mono ${text.length > 4500 ? "text-orange-500" : "text-gray-400"}`}>{text.length}/5000</span>
                  </div>
                </>
              )}
              {(inputMode === "document" || inputMode === "image") && (
                <>
                  <input ref={fileRef} type="file" className="hidden"
                    accept={inputMode === "image" ? "image/png,image/jpeg,image/webp,image/gif" : ".pdf,.docx,.txt,.md,.csv,.json"}
                    onChange={e => handleFileChange(e.target.files?.[0] || null)} />
                  <div
                    onDrop={e => { e.preventDefault(); handleFileChange(e.dataTransfer.files?.[0] || null); }}
                    onDragOver={e => e.preventDefault()}
                    onClick={() => fileRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition
                      ${file ? "border-violet-400 bg-violet-50 dark:bg-violet-900/20" : "border-gray-200 dark:border-gray-700 hover:border-violet-300"}`}>
                    {filePreview && inputMode === "image"
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={filePreview} alt="preview" className="max-h-32 mx-auto rounded-lg object-contain mb-2" />
                      : file
                        ? <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/40 rounded-full flex items-center justify-center mx-auto mb-2"><FileText className="w-5 h-5 text-violet-500" /></div>
                        : <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />}
                    {file ? (
                      <><p className="text-sm font-semibold text-violet-600 dark:text-violet-300 truncate">{file.name}</p><p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB &bull; Click to change</p></>
                    ) : (
                      <><p className="text-sm text-gray-500 font-medium">{inputMode === "image" ? "Upload image (PNG, JPG, WebP)" : "Upload document (PDF, DOCX, TXT, MD)"}</p><p className="text-xs text-gray-400 mt-0.5">Click or drag &amp; drop &bull; Max 5 MB</p></>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Main CTA */}
          <button onClick={handleAnalyzeAndGenerate} disabled={isWorking}
            className="w-full py-3 bg-gradient-to-r from-violet-500 to-blue-600 text-white rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md transition">
            {isWorking
              ? <><Loader2 className="w-4 h-4 animate-spin" />{isAnalyzing ? "Analyzing..." : "Generating..."}</>
              : <><Sparkles className="w-4 h-4" />Analyze &amp; Generate Diagram</>}
          </button>

          {/* Diagram type selector with plan restrictions */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Diagram Type</p>
              {recommendedTypes.length > 0 && <span className="text-xs text-violet-500 font-medium">AI recommended</span>}
            </div>
            <div className="space-y-2">
              {/* Available diagram types */}
              {availableDiagramTypes.map(d => (
                <button key={d.key}
                  onClick={() => { setSelectedType(d.key); if (diagramUid) handleGenerate(d.key); }}
                  disabled={isWorking}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition border
                    ${selectedType === d.key
                      ? "bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-200"
                      : "border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-600 text-gray-600 dark:text-gray-400"}`}>
                  <div className="flex-1 text-left">
                    <div className="font-semibold">{d.label}</div>
                    <div className="text-xs text-gray-400 font-normal">{d.desc}</div>
                  </div>
                  {recommendedTypes.includes(d.key) && (
                    <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold">AI</span>
                  )}
                  {selectedType === d.key && <Check className="w-4 h-4 text-violet-500 shrink-0" />}
                </button>
              ))}
              
              {/* Locked diagram types */}
              {lockedDiagramTypes.map(d => (
                <div key={d.key} className="relative">
                  <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60">
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-gray-500 dark:text-gray-400">{d.label}</div>
                      <div className="text-xs text-gray-400 font-normal">{d.desc}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-orange-500" />
                      <Lock className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                  <div 
                    className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20 rounded-xl cursor-pointer hover:bg-opacity-30 transition"
                    onClick={() => handleUpgrade(subscription.planId === "free" ? "pro" : "ultimate")}
                  >
                    <div className="bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg shadow-md flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700">
                      <Crown className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">Upgrade to {subscription.planId === "free" ? "Pro" : "Ultimate"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {diagramUid && selectedType && (
              <button onClick={() => handleGenerate()} disabled={isWorking}
                className="mt-3 w-full py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 shadow transition">
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                  : <><Sparkles className="w-4 h-4" />Generate {selectedMeta?.label}</>}
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
        <div className="xl:col-span-3 flex flex-col min-h-[580px]">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm flex flex-col flex-1">

            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {selectedMeta && mermaidCode && (
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{selectedMeta.label}</span>
                )}
                {mermaidCode && (
                  <span className="text-[10px] bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">Ready</span>
                )}
              </div>
              {mermaidCode && (
                <div className="flex items-center gap-1.5">
                  <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    <button onClick={() => setViewMode("diagram")}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition
                        ${viewMode === "diagram" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-700 dark:text-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
                      <LayoutGrid className="w-3 h-3" />Diagram
                    </button>
                    <button onClick={() => setViewMode("sql")}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition
                        ${viewMode === "sql" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-700 dark:text-gray-200" : "text-gray-500 hover:text-gray-700"}`}>
                      <Database className="w-3 h-3" />SQL DDL
                    </button>
                  </div>
                  <button onClick={() => handleGenerate()} disabled={isGenerating}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 transition font-medium disabled:opacity-50">
                    <RefreshCw className={`w-3 h-3 ${isGenerating ? "animate-spin" : ""}`} />Regen
                  </button>
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col overflow-hidden">

              {/* Empty state */}
              {!mermaidCode && !isWorking && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-900/30 dark:to-blue-900/30 border border-violet-100 dark:border-violet-800/40 flex items-center justify-center mx-auto mb-5">
                    <Sparkles className="w-9 h-9 text-violet-400" />
                  </div>
                  <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-2">Interactive diagram appears here</p>
                  <p className="text-sm text-gray-400 mb-5 max-w-xs">Enter your content and click <strong>Analyze &amp; Generate</strong></p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 max-w-xs">
                    {["Draggable nodes","Pan & zoom","ER / Class / DFD","Export PNG","SQL DDL export","4 diagram types"].map(f => (
                      <div key={f} className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400 shrink-0" />{f}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading */}
              {isWorking && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                  <div className="relative w-16 h-16 mx-auto mb-5">
                    <div className="absolute inset-0 rounded-full border-4 border-violet-100 dark:border-violet-900" />
                    <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-violet-500" />
                  </div>
                  <p className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">
                    {isAnalyzing ? "Analyzing content..." : "Generating diagram..."}
                  </p>
                  <p className="text-sm text-gray-400">
                    {isAnalyzing ? "AI is extracting entities and relationships" : "Building your interactive diagram"}
                  </p>
                </div>
              )}

              {/* DIAGRAM — interactive ReactFlow */}
              {mermaidCode && !isWorking && viewMode === "diagram" && (
                <div className="flex-1 relative" style={{ minHeight: 440 }}>
                  {hasSql ? (
                    <InlineDiagramViewer
                      sql={diagramSQL}
                      diagramType={erType}
                      theme={isDark ? "dark" : "light"}
                      minHeight={480}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-gray-50 dark:bg-gray-950">
                      <AlertCircle className="w-8 h-8 text-orange-400" />
                      <p className="text-sm text-gray-500 font-medium text-center">
                        Could not generate SQL DDL from your content.
                        <br />Switch to SQL DDL tab and click Generate.
                      </p>
                      <button onClick={() => setViewMode("sql")}
                        className="flex items-center gap-1.5 px-4 py-2 bg-violet-500 text-white rounded-lg text-xs font-bold hover:bg-violet-600 transition">
                        <Database className="w-3.5 h-3.5" />Go to SQL DDL
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* SQL DDL */}
              {mermaidCode && !isWorking && viewMode === "sql" && (
                <div className="flex-1 flex flex-col">
                  {/* Controls */}
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 flex-wrap">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider shrink-0">Dialect:</span>
                    <div className="flex gap-1">
                      {SQL_DIALECTS.map(d => (
                        <button key={d.key} onClick={() => setSqlDialect(d.key)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition border
                            ${sqlDialect === d.key
                              ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent"
                              : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400"}`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <button onClick={handleGenerateSQL} disabled={isGenSql}
                      className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-violet-500 to-blue-600 text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 transition shadow-sm">
                      {isGenSql
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating...</>
                        : <><Database className="w-3.5 h-3.5" />Generate {SQL_DIALECTS.find(d => d.key === sqlDialect)?.label} SQL</>}
                    </button>
                    {sqlCode && (
                      <>
                        <button onClick={handleCopySql} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 transition font-medium text-gray-700 dark:text-gray-300">
                          {copiedSql ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}{copiedSql ? "Copied!" : "Copy"}
                        </button>
                        <button onClick={handleDownloadSql} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition font-medium">
                          <Download className="w-3 h-3" />Download
                        </button>
                      </>
                    )}
                  </div>
                  {/* Output */}
                  <div className="flex-1 overflow-auto">
                    {isGenSql ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                        <p className="text-sm text-gray-500">Generating {SQL_DIALECTS.find(d => d.key === sqlDialect)?.label} SQL...</p>
                      </div>
                    ) : sqlCode ? (
                      <pre className="p-4 font-mono text-xs text-green-300 bg-gray-950 leading-relaxed whitespace-pre-wrap break-words min-h-full">{sqlCode}</pre>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                        <Database className="w-10 h-10 text-gray-300 dark:text-gray-700" />
                        <p className="text-sm font-medium text-gray-500">Select a dialect and click Generate</p>
                        <p className="text-xs text-gray-400 max-w-xs text-center">AI will generate realistic CREATE TABLE statements based on your content</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
