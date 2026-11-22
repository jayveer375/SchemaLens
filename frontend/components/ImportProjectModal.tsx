"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Upload, FileCode, FileJson, Sparkles, CheckCircle,
  AlertTriangle, Database, Layers, ArrowRight, ShieldCheck,
  FolderArchive, FileArchive, FileText, Image as ImageIcon,
  Check, CheckSquare, Square, Trash2, Copy, ChevronDown, ChevronUp,
  Loader2, Eye, EyeOff, Search, Table, Hash, Network, RefreshCw,
} from "lucide-react";
import { genId } from "@/lib/utils";
import { parseSQLSchema } from "@/lib/sqlParser";
import type { Project, ProjectFile, DBType } from "@/lib/types";
import toast from "react-hot-toast";

interface ImportProjectModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (project: Project) => Promise<void> | void;
  ownerId: string;
}

export interface ExtractedFileItem {
  id: string;
  name: string;
  relativePath: string;
  type: "sql" | "json" | "image" | "text";
  sizeBytes: number;
  sql?: string;
  imageUrl?: string;
  selected: boolean;
  tables: string[];
  stats: { tables: number; relationships: number; attributes: number };
  dialect?: DBType;
  error?: string;
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
  if (
    lower.includes("engine=innodb") ||
    lower.includes("auto_increment") ||
    lower.includes("unsigned") ||
    lower.includes("tinyint(1)")
  ) return "mysql";

  if (
    lower.includes("pragma foreign_keys") ||
    (lower.includes("autoincrement") && !lower.includes("auto_increment"))
  ) return "sqlite";

  if (
    lower.includes("datetime2") ||
    lower.includes("nvarchar") ||
    lower.includes("identity(1,1)") ||
    lower.includes("[dbo].") ||
    lower.includes("uniqueidentifier")
  ) return "mssql";

  if (
    lower.includes("varchar2") ||
    lower.includes("number(") ||
    lower.includes("systimestamp") ||
    lower.includes("sysdate")
  ) return "oracle";

  if (
    lower.includes("serial") ||
    lower.includes("timestamptz") ||
    lower.includes("bytea") ||
    lower.includes("uuid_generate_v4()")
  ) return "postgresql";

  return "postgresql";
}

function extractDetailedStats(sql: string) {
  try {
    const schema = parseSQLSchema(sql);
    const tables = schema.tables.length;
    const relationships = schema.relationships.length;
    const attributes = schema.tables.reduce((acc, t) => acc + (t.columns?.length || 0), 0);
    const tableNames = schema.tables.map((t) => t.name);
    return { tables, relationships, attributes, tableNames };
  } catch {
    const tableMatches =
      sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi) || [];
    const tableNames = Array.from(
      new Set(
        tableMatches.map((m) =>
          m
            .replace(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?/i, "")
            .replace(/["'`(\s]/g, "")
        )
      )
    );
    const tables = tableNames.length;
    const relationships = (
      sql.match(/FOREIGN\s+KEY|REFERENCES\s+["'`]?\w+["'`]?/gi) || []
    ).length;
    const attributes = (
      sql.match(/^\s+["'`]?\w+["'`]?\s+[A-Za-z]/gm) || []
    ).length;
    return { tables, relationships, attributes, tableNames };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function cleanProjectName(rawName: string): string {
  return rawName
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ImportProjectModal({
  open,
  onClose,
  onImport,
  ownerId,
}: ImportProjectModalProps) {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState("");
  const [detectedType, setDetectedType] = useState<"zip" | "json" | "sql" | null>(null);

  // Extracted files list & inspection
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFileItem[]>([]);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  // Paste mode text
  const [rawText, setRawText] = useState("");

  // Project configuration
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [dbType, setDbType] = useState<DBType>("postgresql");
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setIsDragging(false);
    setIsAnalyzing(false);
    setAnalyzeStep("");
    setDetectedType(null);
    setExtractedFiles([]);
    setPreviewFileId(null);
    setCopiedId(null);
    setSearchFilter("");
    setRawText("");
    setProjectName("");
    setProjectDesc("");
    setDbType("postgresql");
    setImporting(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !importing) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, importing]);

  // ── Unpack and analyze a ZIP archive ───────────────────────────────────────
  const processZipFile = async (zipFile: File) => {
    setIsAnalyzing(true);
    setAnalyzeStep("Loading ZIP archive...");
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(zipFile);

      setAnalyzeStep("Analyzing archive structure & files...");

      const entries = Object.keys(zip.files)
        .map((k) => zip.files[k])
        .filter((entry) => {
          // Ignore directories, macOS metadata, and hidden files
          if (entry.dir) return false;
          if (entry.name.startsWith("__MACOSX/") || entry.name.includes("/__MACOSX/")) return false;
          const parts = entry.name.split("/");
          if (parts.some((p) => p.startsWith("."))) return false;
          return true;
        });

      if (entries.length === 0) {
        toast.error("The ZIP archive is empty or contains only directories");
        setIsAnalyzing(false);
        return;
      }

      // Check for manifest.json (SchemaLens project export)
      let manifestObj: any = null;
      const manifestEntry = entries.find((e) => e.name.toLowerCase() === "manifest.json" || e.name.toLowerCase().endsWith("/manifest.json"));
      if (manifestEntry) {
        try {
          const manifestText = await manifestEntry.async("text");
          manifestObj = JSON.parse(manifestText);
        } catch {
          // Non-fatal if manifest is invalid JSON
        }
      }

      // Detect SchemaLens structure: sql/ and json/ folders
      const hasSqlFolder = entries.some((e) => e.name.startsWith("sql/") || e.name.includes("/sql/"));
      const hasJsonFolder = entries.some((e) => e.name.startsWith("json/") || e.name.includes("/json/"));
      const isSchemaLensZip = !!manifestObj || (hasSqlFolder && hasJsonFolder);

      const items: ExtractedFileItem[] = [];
      const dialectVotes: Record<DBType, number> = {
        postgresql: 0,
        mysql: 0,
        sqlite: 0,
        mssql: 0,
        oracle: 0,
        mongodb: 0,
        prisma: 0,
        django: 0,
        laravel: 0,
        sequelize: 0,
        hibernate: 0,
      };

      setAnalyzeStep("Extracting schemas and database entities...");

      // If it's a SchemaLens exported zip:
      // Canonical schemas live in sql/*.sql, with metadata in json/*.json and txt/*.txt.
      if (isSchemaLensZip && hasSqlFolder) {
        const sqlEntries = entries.filter(
          (e) => (e.name.startsWith("sql/") || e.name.includes("/sql/")) && e.name.match(/\.(sql|txt)$/i)
        );

        for (const entry of sqlEntries) {
          const sqlText = (await entry.async("text")).trim();
          if (!sqlText) continue;

          const baseName = entry.name.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
          const cleanName = `${baseName}.sql`;

          // Check if there is an accompanying json metadata file
          let fileStats: { tables: number; relationships: number; attributes: number } | null = null;
          const jsonPartner = entries.find(
            (e) => (e.name.startsWith("json/") || e.name.includes("/json/")) && e.name.includes(`${baseName}.json`)
          );
          if (jsonPartner) {
            try {
              const jText = await jsonPartner.async("text");
              const jObj = JSON.parse(jText);
              if (jObj.stats) fileStats = jObj.stats;
            } catch {
              /* ignore */
            }
          }

          const parsed = extractDetailedStats(sqlText);
          const detected = detectDialect(sqlText);
          dialectVotes[detected] = (dialectVotes[detected] || 0) + 1;

          items.push({
            id: genId(),
            name: cleanName,
            relativePath: entry.name,
            type: "sql",
            sizeBytes: sqlText.length,
            sql: sqlText,
            selected: true,
            tables: parsed.tableNames,
            stats: fileStats || {
              tables: parsed.tables,
              relationships: parsed.relationships,
              attributes: parsed.attributes,
            },
            dialect: detected,
          });
        }
      } else {
        // Generic ZIP archive: parse all candidate files (.sql, .ddl, .json, images)
        for (const entry of entries) {
          const lowerName = entry.name.toLowerCase();
          const baseName = entry.name.replace(/^.*[\\/]/, "");

          // 1. SQL schema scripts
          if (lowerName.match(/\.(sql|ddl|mysql|pgsql|sqlite|psql)$/i)) {
            const sqlText = (await entry.async("text")).trim();
            if (!sqlText) continue;

            const parsed = extractDetailedStats(sqlText);
            const detected = detectDialect(sqlText);
            dialectVotes[detected] = (dialectVotes[detected] || 0) + 1;

            items.push({
              id: genId(),
              name: baseName,
              relativePath: entry.name,
              type: "sql",
              sizeBytes: sqlText.length,
              sql: sqlText,
              selected: true,
              tables: parsed.tableNames,
              stats: {
                tables: parsed.tables,
                relationships: parsed.relationships,
                attributes: parsed.attributes,
              },
              dialect: detected,
            });
          }
          // 2. JSON files (SchemaLens project or schema dump)
          else if (lowerName.endsWith(".json") && entry !== manifestEntry) {
            const jsonText = await entry.async("text");
            try {
              const jsonObj = JSON.parse(jsonText);
              // If it's a full project export JSON
              if (Array.isArray(jsonObj.files) && jsonObj.files.length > 0) {
                jsonObj.files.forEach((f: any, idx: number) => {
                  const fSql = f.sql || "";
                  const parsed = fSql ? extractDetailedStats(fSql) : { tables: 0, relationships: 0, attributes: 0, tableNames: [] };
                  items.push({
                    id: genId(),
                    name: f.name || `schema_${idx + 1}.sql`,
                    relativePath: entry.name,
                    type: "sql",
                    sizeBytes: fSql.length || jsonText.length,
                    sql: fSql,
                    imageUrl: f.imageUrl || "",
                    selected: true,
                    tables: parsed.tableNames,
                    stats: f.stats || {
                      tables: parsed.tables,
                      relationships: parsed.relationships,
                      attributes: parsed.attributes,
                    },
                    dialect: f.dbType || jsonObj.dbType || "postgresql",
                  });
                });
              } else if (jsonObj.sql) {
                const parsed = extractDetailedStats(jsonObj.sql);
                items.push({
                  id: genId(),
                  name: jsonObj.filename || baseName.replace(/\.json$/i, ".sql"),
                  relativePath: entry.name,
                  type: "sql",
                  sizeBytes: jsonObj.sql.length,
                  sql: jsonObj.sql,
                  selected: true,
                  tables: parsed.tableNames,
                  stats: jsonObj.stats || {
                    tables: parsed.tables,
                    relationships: parsed.relationships,
                    attributes: parsed.attributes,
                  },
                  dialect: jsonObj.dbType || "postgresql",
                });
              }
            } catch {
              /* ignore parse error */
            }
          }
          // 3. ER Diagram Images
          else if (lowerName.match(/\.(png|jpg|jpeg|webp|svg)$/i)) {
            const b64 = await entry.async("base64");
            const ext = lowerName.split(".").pop() || "png";
            const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
            const dataUrl = `data:${mime};base64,${b64}`;

            items.push({
              id: genId(),
              name: baseName,
              relativePath: entry.name,
              type: "image",
              sizeBytes: Math.round((b64.length * 3) / 4),
              imageUrl: dataUrl,
              selected: true,
              tables: [],
              stats: { tables: 0, relationships: 0, attributes: 0 },
            });
          }
          // 4. Text files containing DDL
          else if (lowerName.endsWith(".txt")) {
            const txt = (await entry.async("text")).trim();
            if (txt.includes("CREATE TABLE") || txt.includes("create table")) {
              const parsed = extractDetailedStats(txt);
              const detected = detectDialect(txt);
              dialectVotes[detected] = (dialectVotes[detected] || 0) + 1;

              items.push({
                id: genId(),
                name: baseName.replace(/\.txt$/i, ".sql"),
                relativePath: entry.name,
                type: "sql",
                sizeBytes: txt.length,
                sql: txt,
                selected: true,
                tables: parsed.tableNames,
                stats: {
                  tables: parsed.tables,
                  relationships: parsed.relationships,
                  attributes: parsed.attributes,
                },
                dialect: detected,
              });
            }
          }
        }
      }

      if (items.length === 0) {
        toast.error("No valid database schemas (.sql, .ddl, .json) or ER diagram images found in this ZIP archive.");
        setIsAnalyzing(false);
        return;
      }

      // Determine default project name
      let defaultName = "";
      if (manifestObj?.project || manifestObj?.name) {
        defaultName = manifestObj.project || manifestObj.name;
      } else {
        defaultName = cleanProjectName(zipFile.name);
      }
      setProjectName(defaultName);

      // Determine default description
      if (manifestObj?.description) {
        setProjectDesc(manifestObj.description);
      } else {
        const sqlCount = items.filter((i) => i.type === "sql").length;
        const imgCount = items.filter((i) => i.type === "image").length;
        const parts: string[] = [];
        if (sqlCount > 0) parts.push(`${sqlCount} schema file${sqlCount !== 1 ? "s" : ""}`);
        if (imgCount > 0) parts.push(`${imgCount} diagram image${imgCount !== 1 ? "s" : ""}`);
        setProjectDesc(`Imported from ${zipFile.name} (${parts.join(", ")})`);
      }

      // Determine most likely dialect
      if (manifestObj?.dbType && DB_TYPES.some((d) => d.id === manifestObj.dbType)) {
        setDbType(manifestObj.dbType);
      } else {
        let bestDialect: DBType = "postgresql";
        let maxVotes = -1;
        (Object.keys(dialectVotes) as DBType[]).forEach((d) => {
          if (dialectVotes[d] > maxVotes && maxVotes >= 0) {
            maxVotes = dialectVotes[d];
            bestDialect = d;
          } else if (maxVotes === -1 && dialectVotes[d] > 0) {
            maxVotes = dialectVotes[d];
            bestDialect = d;
          }
        });
        setDbType(bestDialect);
      }

      setExtractedFiles(items);
      setDetectedType("zip");

      const totalTables = items.reduce((sum, item) => sum + item.stats.tables, 0);
      const totalRelations = items.reduce((sum, item) => sum + item.stats.relationships, 0);
      toast.success(
        `ZIP archive analyzed: ${items.length} files (${totalTables} tables, ${totalRelations} relationships found)!`
      );
    } catch (err: any) {
      console.error("ZIP parsing error:", err);
      toast.error(err?.message || "Failed to decompress and analyze ZIP archive");
    } finally {
      setIsAnalyzing(false);
      setAnalyzeStep("");
    }
  };

  // ── Process non-zip content (SQL or JSON file) ─────────────────────────────
  const processSingleFileContent = (content: string, filename: string, sizeBytes: number) => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("The selected file is empty");
      return;
    }

    // Try parsing as JSON first
    try {
      const obj = JSON.parse(trimmed);
      setDetectedType("json");

      const name = obj.name || cleanProjectName(filename);
      setProjectName(name);
      setProjectDesc(obj.description || "Imported from SchemaLens project JSON backup");
      if (obj.dbType && DB_TYPES.some((d) => d.id === obj.dbType)) {
        setDbType(obj.dbType);
      }

      let filesList: ExtractedFileItem[] = [];
      if (Array.isArray(obj.files) && obj.files.length > 0) {
        filesList = obj.files.map((f: any, idx: number) => {
          const fSql = f.sql || "";
          const parsed = fSql ? extractDetailedStats(fSql) : { tables: 0, relationships: 0, attributes: 0, tableNames: [] };
          return {
            id: genId(),
            name: f.name || `schema_${idx + 1}.sql`,
            relativePath: f.name || `schema_${idx + 1}.sql`,
            type: (f.imageUrl && !fSql ? "image" : "sql") as "sql" | "image",
            sizeBytes: fSql.length || (f.imageUrl ? 1024 : 500),
            sql: fSql,
            imageUrl: f.imageUrl || "",
            selected: true,
            tables: parsed.tableNames,
            stats: f.stats || {
              tables: parsed.tables,
              relationships: parsed.relationships,
              attributes: parsed.attributes,
            },
            dialect: f.dbType || obj.dbType || "postgresql",
          };
        });
      } else if (obj.sql) {
        const parsed = extractDetailedStats(obj.sql);
        filesList = [
          {
            id: genId(),
            name: `${cleanProjectName(name).toLowerCase().replace(/\s+/g, "_")}.sql`,
            relativePath: filename,
            type: "sql",
            sizeBytes: obj.sql.length,
            sql: obj.sql,
            selected: true,
            tables: parsed.tableNames,
            stats: obj.stats || {
              tables: parsed.tables,
              relationships: parsed.relationships,
              attributes: parsed.attributes,
            },
            dialect: obj.dbType || "postgresql",
          },
        ];
      }

      if (filesList.length === 0) {
        toast.error("No valid SQL or diagram data found in this JSON file");
        return;
      }

      setExtractedFiles(filesList);
      toast.success(`Project structure parsed (${filesList.length} file${filesList.length !== 1 ? "s" : ""})`);
      return;
    } catch {
      // Fall through to SQL
    }

    // Treat as SQL
    setDetectedType("sql");
    const defaultName = cleanProjectName(filename);
    setProjectName(defaultName);
    setProjectDesc("Imported from SQL DDL script");

    const detected = detectDialect(trimmed);
    setDbType(detected);

    const parsed = extractDetailedStats(trimmed);
    const item: ExtractedFileItem = {
      id: genId(),
      name: filename.endsWith(".sql") ? filename : `${filename}.sql`,
      relativePath: filename,
      type: "sql",
      sizeBytes,
      sql: trimmed,
      selected: true,
      tables: parsed.tableNames,
      stats: {
        tables: parsed.tables,
        relationships: parsed.relationships,
        attributes: parsed.attributes,
      },
      dialect: detected,
    };

    setExtractedFiles([item]);
    toast.success(`SQL parsed: ${parsed.tables} tables, ${parsed.relationships} relationships detected`);
  };

  // ── Handle incoming file from drop or file input ───────────────────────────
  const handleIncomingFile = (selected: File) => {
    setFile(selected);
    const lowerName = selected.name.toLowerCase();

    if (lowerName.endsWith(".zip") || selected.type.includes("zip")) {
      processZipFile(selected);
    } else if (lowerName.match(/\.(json|sql|ddl|txt)$/i)) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        processSingleFileContent(content, selected.name, selected.size);
      };
      reader.onerror = () => {
        toast.error("Failed to read the selected file");
      };
      reader.readAsText(selected);
    } else {
      toast.error("Unsupported file type. Please upload a .zip, .sql, or .json file.");
      setFile(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleIncomingFile(selected);
    }
  };

  // ── Drag & drop handlers ──────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleIncomingFile(droppedFile);
    }
  };

  // ── Paste tab analysis ─────────────────────────────────────────────────────
  const handlePasteChange = (text: string) => {
    setRawText(text);
    const trimmed = text.trim();
    if (trimmed.length < 15) {
      setExtractedFiles([]);
      return;
    }

    try {
      const obj = JSON.parse(trimmed);
      setDetectedType("json");
      const name = obj.name || "Pasted JSON Project";
      setProjectName(name);
      setProjectDesc(obj.description || "Imported from pasted JSON schema");
      if (obj.dbType && DB_TYPES.some((d) => d.id === obj.dbType)) setDbType(obj.dbType);

      if (Array.isArray(obj.files) && obj.files.length > 0) {
        setExtractedFiles(
          obj.files.map((f: any, idx: number) => {
            const fSql = f.sql || "";
            const parsed = fSql ? extractDetailedStats(fSql) : { tables: 0, relationships: 0, attributes: 0, tableNames: [] };
            return {
              id: genId(),
              name: f.name || `schema_${idx + 1}.sql`,
              relativePath: f.name || `schema_${idx + 1}.sql`,
              type: "sql" as const,
              sizeBytes: fSql.length,
              sql: fSql,
              selected: true,
              tables: parsed.tableNames,
              stats: f.stats || { tables: parsed.tables, relationships: parsed.relationships, attributes: parsed.attributes },
              dialect: f.dbType || obj.dbType || "postgresql",
            };
          })
        );
        return;
      }
    } catch {
      // Treat as SQL
    }

    setDetectedType("sql");
    setProjectName((prev) => prev || "Pasted SQL Schema");
    setProjectDesc((prev) => prev || "Imported from pasted SQL DDL script");
    const detected = detectDialect(trimmed);
    setDbType(detected);

    const parsed = extractDetailedStats(trimmed);
    setExtractedFiles([
      {
        id: "pasted-sql",
        name: "pasted_schema.sql",
        relativePath: "pasted_schema.sql",
        type: "sql",
        sizeBytes: trimmed.length,
        sql: trimmed,
        selected: true,
        tables: parsed.tableNames,
        stats: {
          tables: parsed.tables,
          relationships: parsed.relationships,
          attributes: parsed.attributes,
        },
        dialect: detected,
      },
    ]);
  };

  // ── Toggle individual file selection ──────────────────────────────────────
  const toggleFileSelected = (id: string) => {
    setExtractedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  const selectAllFiles = (select: boolean) => {
    setExtractedFiles((prev) => prev.map((f) => ({ ...f, selected: select })));
  };

  // ── Copy SQL helper ────────────────────────────────────────────────────────
  const copySql = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("SQL copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Calculate aggregated stats from selected files ─────────────────────────
  const selectedFiles = extractedFiles.filter((f) => f.selected);
  const totalTables = selectedFiles.reduce((sum, f) => sum + f.stats.tables, 0);
  const totalRelationships = selectedFiles.reduce((sum, f) => sum + f.stats.relationships, 0);
  const totalAttributes = selectedFiles.reduce((sum, f) => sum + f.stats.attributes, 0);
  const allDiscoveredTableNames = Array.from(
    new Set(selectedFiles.flatMap((f) => f.tables))
  );

  // ── Submit / Import Action ─────────────────────────────────────────────────
  const handleConfirmImport = async () => {
    if (!projectName.trim()) {
      toast.error("Project name is required");
      return;
    }
    if (selectedFiles.length === 0) {
      toast.error("Please select at least one schema or diagram file to import");
      return;
    }

    setImporting(true);
    try {
      const now = Date.now();
      const projectFiles: ProjectFile[] = selectedFiles.map((f) => ({
        id: genId(),
        name: f.name,
        imageUrl: f.imageUrl || "",
        status: "completed",
        sql: f.sql || "",
        uploadedAt: now,
        completedAt: now,
        stats: f.stats,
      }));

      const newProject: Project = {
        id: genId(),
        ownerId,
        name: projectName.trim(),
        description: projectDesc.trim() || undefined,
        dbType,
        createdAt: now,
        updatedAt: now,
        files: projectFiles,
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

  const filteredFiles = extractedFiles.filter((f) =>
    f.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    f.relativePath.toLowerCase().includes(searchFilter.toLowerCase()) ||
    f.tables.some((t) => t.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!importing ? handleClose : undefined}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-3xl my-auto max-h-[92vh] flex flex-col rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden"
          >
            {/* Header (Sticky) */}
            <div className="bg-gradient-to-r from-violet-600 via-indigo-600 to-primary-600 px-5 sm:px-6 py-4 text-white shrink-0 relative">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shadow-inner shrink-0">
                    <FolderArchive size={20} className="text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg sm:text-xl font-bold tracking-tight">Import Project</h2>
                      <span className="badge bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-white/30">
                        Pro &amp; Ultimate
                      </span>
                    </div>
                    <p className="text-white/80 text-xs sm:text-sm mt-0.5">
                      Upload ZIP archives, SchemaLens backups, or raw SQL DDL files.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  disabled={importing}
                  className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center hover:bg-white/25 transition-colors shrink-0 disabled:opacity-50"
                  aria-label="Close modal"
                >
                  <X size={16} className="text-white" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
              {/* Mode Selection Tabs */}
              <div className="flex rounded-xl bg-[var(--surface)] p-1 border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setActiveTab("file")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                    activeTab === "file"
                      ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <FileArchive size={15} /> Upload Archive / File (.zip, .sql, .json)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("paste")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                    activeTab === "paste"
                      ? "bg-[var(--card)] text-[var(--text)] shadow-sm"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  <FileCode size={15} /> Paste SQL / JSON
                </button>
              </div>

              {/* Tab 1: File / ZIP Upload */}
              {activeTab === "file" && (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.json,.sql,.ddl,.mysql,.pgsql,.sqlite,.txt,application/zip,application/x-zip-compressed"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  {/* Dropzone */}
                  {!file && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all group ${
                        isDragging
                          ? "border-primary-500 bg-primary-500/10 scale-[1.01]"
                          : "border-[var(--border)] hover:border-primary-500 hover:bg-[var(--surface)]"
                      }`}
                    >
                      <motion.div
                        animate={isDragging ? { scale: 1.15, rotate: -3 } : { scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                        className="w-14 h-14 rounded-2xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center mx-auto mb-3.5 group-hover:scale-105 transition-transform"
                      >
                        <FolderArchive size={28} strokeWidth={1.75} />
                      </motion.div>

                      <p className="text-sm sm:text-base font-bold text-[var(--text)] mb-1">
                        {isDragging ? "Release to analyze archive" : "Drop project archive (.zip) or schema file here"}
                      </p>
                      <p className="text-xs sm:text-sm text-[var(--text-muted)] mb-3">
                        or <span className="text-primary-600 underline font-semibold">browse local files</span>
                      </p>

                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-[var(--text-subtle)]">Accepted:</span>
                        <span className="badge badge-indigo text-[11px] font-mono font-bold">.ZIP Archive</span>
                        <span className="badge badge-emerald text-[11px] font-mono font-bold">.SQL Scripts</span>
                        <span className="badge badge-amber text-[11px] font-mono font-bold">.JSON Backups</span>
                      </div>
                    </div>
                  )}

                  {/* Processing / Analyzing Banner */}
                  {isAnalyzing && (
                    <div className="p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-center space-y-3">
                      <Loader2 size={32} className="animate-spin text-primary-500 mx-auto" />
                      <p className="text-sm font-bold text-[var(--text)]">{analyzeStep}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Decompressing archive, analyzing relational tables, and extracting foreign keys...
                      </p>
                    </div>
                  )}

                  {/* Loaded File Overview Card */}
                  {file && !isAnalyzing && (
                    <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
                          {detectedType === "zip" ? (
                            <FolderArchive size={20} />
                          ) : detectedType === "json" ? (
                            <FileJson size={20} />
                          ) : (
                            <FileCode size={20} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[var(--text)] truncate max-w-xs sm:max-w-md">
                            {file.name}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {formatBytes(file.size)} ·{" "}
                            <span className="font-semibold text-primary-600 uppercase">
                              {detectedType || "file"}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 border border-[var(--border)]"
                          title="Change file"
                        >
                          <RefreshCw size={13} /> Change
                        </button>
                        <button
                          type="button"
                          onClick={resetState}
                          className="btn-ghost text-xs px-2.5 py-1.5 text-red-500 hover:text-red-600 flex items-center gap-1 border border-[var(--border)]"
                          title="Remove file"
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 2: Paste SQL / JSON */}
              {activeTab === "paste" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">
                      Paste Schema or Project JSON
                    </label>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Instant DDL &amp; table detection
                    </span>
                  </div>
                  <textarea
                    value={rawText}
                    onChange={(e) => handlePasteChange(e.target.value)}
                    placeholder="Paste SQL schema (CREATE TABLE...) or SchemaLens project backup JSON here..."
                    rows={6}
                    className="w-full text-xs font-mono p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}

              {/* Analysis Dashboard (If files or schemas are loaded) */}
              {extractedFiles.length > 0 && !isAnalyzing && (
                <div className="space-y-4 pt-1">
                  {/* Key Metrics Grid (Responsive: 2-col on mobile, 4-col on desktop) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                    <div className="card p-3 sm:p-3.5 bg-[var(--card)] border border-[var(--border)] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                        <Table size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          Tables
                        </p>
                        <p className="text-base sm:text-lg font-extrabold text-[var(--text)]">
                          {totalTables}
                        </p>
                      </div>
                    </div>

                    <div className="card p-3 sm:p-3.5 bg-[var(--card)] border border-[var(--border)] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <Network size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          Relations (FK)
                        </p>
                        <p className="text-base sm:text-lg font-extrabold text-[var(--text)]">
                          {totalRelationships}
                        </p>
                      </div>
                    </div>

                    <div className="card p-3 sm:p-3.5 bg-[var(--card)] border border-[var(--border)] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Hash size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          Columns
                        </p>
                        <p className="text-base sm:text-lg font-extrabold text-[var(--text)]">
                          {totalAttributes}
                        </p>
                      </div>
                    </div>

                    <div className="card p-3 sm:p-3.5 bg-[var(--card)] border border-[var(--border)] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <FileCode size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          Files Selected
                        </p>
                        <p className="text-base sm:text-lg font-extrabold text-[var(--text)]">
                          {selectedFiles.length}{" "}
                          <span className="text-xs font-normal text-[var(--text-muted)]">
                            / {extractedFiles.length}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Discovered Entities Cloud */}
                  {allDiscoveredTableNames.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[var(--text)] uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle size={14} className="text-emerald-500" />
                          Discovered Entities ({allDiscoveredTableNames.length}):
                        </span>
                        <span className="badge badge-indigo text-[10px] uppercase font-mono font-semibold">
                          Dialect: {dbType.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar pt-1">
                        {allDiscoveredTableNames.map((tbl) => (
                          <span
                            key={tbl}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono bg-[var(--card)] border border-[var(--border)] text-[var(--text)] font-semibold shadow-2xs"
                          >
                            <Table size={11} className="text-primary-500" />
                            {tbl}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extracted Files Explorer */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-[var(--text)] uppercase tracking-wider">
                          Files in Archive ({selectedFiles.length}/{extractedFiles.length} selected)
                        </h4>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => selectAllFiles(true)}
                          className="text-primary-600 hover:underline font-semibold"
                        >
                          Select All
                        </button>
                        <span className="text-[var(--text-muted)]">·</span>
                        <button
                          type="button"
                          onClick={() => selectAllFiles(false)}
                          className="text-[var(--text-muted)] hover:underline"
                        >
                          Deselect All
                        </button>
                      </div>
                    </div>

                    {/* Filter if more than 3 files */}
                    {extractedFiles.length > 3 && (
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
                        <input
                          type="text"
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          placeholder="Filter files by name or table..."
                          className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                      </div>
                    )}

                    {/* Files List */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {filteredFiles.map((item) => {
                        const isExpanded = previewFileId === item.id;
                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border transition-all ${
                              item.selected
                                ? "border-[var(--border)] bg-[var(--card)] shadow-xs"
                                : "border-[var(--border)] opacity-60 bg-[var(--surface)]"
                            }`}
                          >
                            <div className="p-3 flex items-center justify-between gap-3">
                              {/* Checkbox + Icon + Filename */}
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <button
                                  type="button"
                                  onClick={() => toggleFileSelected(item.id)}
                                  className="text-primary-600 hover:text-primary-700 shrink-0"
                                >
                                  {item.selected ? (
                                    <CheckSquare size={17} />
                                  ) : (
                                    <Square size={17} className="text-[var(--text-muted)]" />
                                  )}
                                </button>

                                <div className="shrink-0">
                                  {item.type === "sql" ? (
                                    <FileCode size={17} className="text-violet-500" />
                                  ) : item.type === "image" ? (
                                    <ImageIcon size={17} className="text-amber-500" />
                                  ) : (
                                    <FileJson size={17} className="text-emerald-500" />
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="text-xs sm:text-sm font-semibold text-[var(--text)] truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                                    {item.relativePath !== item.name && (
                                      <span className="font-mono text-[10px] mr-1.5 opacity-75">
                                        {item.relativePath}
                                      </span>
                                    )}
                                    {formatBytes(item.sizeBytes)}
                                    {item.stats.tables > 0 && ` · ${item.stats.tables} tables`}
                                    {item.stats.relationships > 0 && ` · ${item.stats.relationships} FKs`}
                                  </p>
                                </div>
                              </div>

                              {/* Preview Toggle Button */}
                              {(item.sql || item.imageUrl) && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewFileId(isExpanded ? null : item.id)}
                                  className="btn-ghost text-xs px-2.5 py-1.5 border border-[var(--border)] flex items-center gap-1 shrink-0"
                                >
                                  {isExpanded ? <EyeOff size={13} /> : <Eye size={13} />}
                                  <span className="hidden sm:inline">
                                    {isExpanded ? "Hide" : "Preview"}
                                  </span>
                                </button>
                              )}
                            </div>

                            {/* Inline Code / Image Preview */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: "auto", opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-[var(--border)] p-3 bg-[var(--surface)] overflow-hidden"
                                >
                                  {item.type === "image" && item.imageUrl ? (
                                    <div className="flex justify-center p-2">
                                      <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        className="max-h-48 rounded-lg object-contain border border-[var(--border)] shadow-xs"
                                      />
                                    </div>
                                  ) : item.sql ? (
                                    <div className="relative">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[11px] font-mono text-[var(--text-muted)]">
                                          SQL Schema Preview ({item.sql.split("\n").length} lines)
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => copySql(item.id, item.sql!)}
                                          className="text-[11px] text-primary-600 hover:underline flex items-center gap-1 font-semibold"
                                        >
                                          {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                                          {copiedId === item.id ? "Copied" : "Copy SQL"}
                                        </button>
                                      </div>
                                      <pre className="text-xs font-mono p-3 rounded-lg bg-black/80 text-emerald-300 max-h-48 overflow-auto custom-scrollbar select-text">
                                        {item.sql}
                                      </pre>
                                    </div>
                                  ) : null}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Project Configuration Form */}
              <div className="space-y-3.5 pt-2 border-t border-[var(--border)]">
                <div>
                  <label className="text-xs font-bold text-[var(--text)] uppercase tracking-wider block mb-1">
                    Project Name *
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., Hospital Management System"
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm border border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-[var(--text)] uppercase tracking-wider block mb-1">
                      Target Database Dialect
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
                      <Database
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
                      />
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
            </div>

            {/* Footer (Sticky) */}
            <div className="shrink-0 p-3.5 sm:p-4 px-4 sm:px-6 border-t border-[var(--border)] bg-[var(--card)]/95 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-muted)] text-center sm:text-left">
                {selectedFiles.length > 0 ? (
                  <span>
                    Ready to import{" "}
                    <strong className="text-[var(--text)] font-semibold">
                      {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""}
                    </strong>{" "}
                    ({totalTables} tables detected)
                  </span>
                ) : (
                  <span>Select or upload files to begin import</span>
                )}
              </div>

              <div className="flex items-center gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={importing}
                  className="btn-ghost text-xs sm:text-sm px-4 py-2.5 flex-1 sm:flex-none justify-center"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || selectedFiles.length === 0 || !projectName.trim()}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold
                    bg-gradient-to-r from-violet-600 via-indigo-600 to-primary-600 text-white
                    hover:shadow-lg hover:shadow-primary-500/25 transition-all
                    disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-none"
                >
                  {importing ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Importing Project…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      <span>Confirm &amp; Import Project</span>
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
