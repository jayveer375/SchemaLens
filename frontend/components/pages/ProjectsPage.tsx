"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, FolderOpen, MoreVertical, Trash2, Edit2, Copy,
  Database, Pin, X, CheckSquare, Square, AlertTriangle, List, Globe2,
  Upload, Download,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { genId, timeAgo, downloadJSON } from "@/lib/utils";
import { canCreateProject, canImportProject } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import type { Project, DBType } from "@/lib/types";
import UpgradeLimitDialog from "@/components/UpgradeLimitDialog";
import ImportProjectModal from "@/components/ImportProjectModal";
import GalaxyView from "@/components/GalaxyView";
import toast from "react-hot-toast";
import { apiSaveProject, apiDeleteProject } from "@/lib/api";

const DB_TYPES: { id: DBType; label: string }[] = [
  { id: "postgresql", label: "PostgreSQL" },
  { id: "mysql",      label: "MySQL" },
  { id: "sqlite",     label: "SQLite" },
  { id: "mssql",      label: "SQL Server" },
  { id: "oracle",     label: "Oracle" },
];

type ViewMode = "list" | "galaxy";

export default function ProjectsPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { projects, upsertProject, deleteProject, setActiveProject, user, getSubscription } = useStore();
  const ownerId = user?.id ?? "";

  const [search,    setSearch]    = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [limitReason, setLimitReason] = useState<"projects" | "import">("projects");
  const [menuOpen,  setMenuOpen]  = useState<string | null>(null);
  const [renaming,  setRenaming]  = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [form, setForm] = useState({ name: "", description: "", dbType: "postgresql" as DBType });
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // ── Multi-select state ────────────────────────────────────────────────────
  const [selectMode,   setSelectMode]   = useState(false);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [confirmBulk,  setConfirmBulk]  = useState(false); // delete confirm dialog

  const myProjects = projects.filter(p => p.ownerId === ownerId);

  const filtered = myProjects
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);

  // ── Select helpers ────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const bulkDelete = async () => {
    const numericId = parseInt(user?.id ?? "", 10);
    selected.forEach(id => {
      deleteProject(id, ownerId);
      if (!isNaN(numericId)) apiDeleteProject(numericId, id).catch(() => {});
    });
    const count = selected.size;
    exitSelectMode(); setConfirmBulk(false);
    toast.success(`${count} project${count !== 1 ? "s" : ""} deleted`);
  };

  // ── Helper: save project to DB ────────────────────────────────────────────
  const syncProject = async (p: Project) => {
    const numericId = parseInt(user?.id ?? "", 10);
    if (isNaN(numericId)) return;
    try {
      await apiSaveProject({
        user_id: numericId, id: p.id, name: p.name,
        description: p.description, db_type: p.dbType,
        files: p.files, pinned: p.pinned ?? false,
      });
    } catch { /* non-fatal */ }
  };

  // ── Single project actions ────────────────────────────────────────────────
  const createProject = async () => {
    if (!form.name.trim()) { toast.error("Project name is required"); return; }
    if (!canCreateProject(getSubscription(), myProjects.length)) {
      setLimitOpen(true); setShowCreate(false); return;
    }
    const p: Project = {
      id: genId(), ownerId, name: form.name.trim(), description: form.description,
      dbType: form.dbType, createdAt: Date.now(), updatedAt: Date.now(), files: [],
    };
    upsertProject(p);
    await syncProject(p);          // ← save to PostgreSQL
    setActiveProject(p.id);
    setShowCreate(false);
    setForm({ name: "", description: "", dbType: "postgresql" });
    toast.success("Project created!");
    onNavigate("project-detail");
  };

  const duplicate = async (p: Project) => {
    const dup: Project = { ...p, id: genId(), ownerId, name: `${p.name} (Copy)`, createdAt: Date.now(), updatedAt: Date.now(), files: [] };
    upsertProject(dup);
    await syncProject(dup);        // ← save to PostgreSQL
    toast.success("Project duplicated");
  };

  const startRename = (p: Project) => { setRenaming(p.id); setRenameVal(p.name); setMenuOpen(null); };
  const confirmRename = async (p: Project) => {
    if (renameVal.trim()) {
      const updated = { ...p, name: renameVal.trim(), updatedAt: Date.now() };
      upsertProject(updated);
      await syncProject(updated);  // ← save to PostgreSQL
      toast.success("Renamed");
    }
    setRenaming(null);
  };
  const sub = getSubscription();
  const isProOrUltimate = canImportProject(sub);

  const handleImportClick = () => {
    if (!isProOrUltimate) {
      setLimitReason("import");
      setLimitOpen(true);
      return;
    }
    if (!canCreateProject(sub, myProjects.length)) {
      setLimitReason("projects");
      setLimitOpen(true);
      return;
    }
    setShowImport(true);
  };

  const handleImportSuccess = async (importedProject: Project) => {
    upsertProject(importedProject);
    await syncProject(importedProject);
    setActiveProject(importedProject.id);
    toast.success(`Project "${importedProject.name}" imported successfully!`);
    onNavigate("project-detail");
  };

  const exportProject = (p: Project) => {
    downloadJSON(p, `${p.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}_project.json`);
    toast.success("Project exported as JSON");
  };

  const togglePin = async (p: Project) => {
    const updated = { ...p, pinned: !p.pinned, updatedAt: Date.now() };
    upsertProject(updated);
    await syncProject(updated);    // ← save to PostgreSQL
  };

  const inp = "w-full py-2.5 px-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all";

  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Projects</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {myProjects.length} project{myProjects.length !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--card)] p-0.5 overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                viewMode === "list"
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
              )}
              title="List View"
            >
              <List size={13} /> List
            </button>
            <button
              onClick={() => { setViewMode("galaxy"); setSelectMode(false); setSelected(new Set()); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                viewMode === "galaxy"
                  ? "bg-[var(--primary)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
              )}
              title="Galaxy View"
            >
              <Globe2 size={13} /> Galaxy
            </button>
          </div>

          {/* Select mode toggle (list view only) */}
          {viewMode === "list" && myProjects.length > 0 && !selectMode && (
            <button
              onClick={() => { setSelectMode(true); setSelected(new Set()); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold
                border border-[var(--border)] text-[var(--text-muted)] bg-[var(--card)]
                hover:bg-[var(--surface)] hover:text-[var(--text)] hover:border-[var(--text-subtle)]
                transition-all"
              title="Select projects to delete"
            >
              <CheckSquare size={14} /> Select
            </button>
          )}
          {viewMode === "list" && selectMode && (
            <button onClick={exitSelectMode}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold
                border border-[var(--border)] text-[var(--text)] bg-[var(--card)]
                hover:bg-[var(--surface)] transition-all"
            >
              <X size={14} /> Cancel
            </button>
          )}
          {/* Import Project Button (Pro & Ultimate Feature) */}
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={handleImportClick}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold
              border border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/10
              hover:bg-violet-500/20 hover:border-violet-500/50 transition-all cursor-pointer"
            title="Import Project (Pro & Ultimate Feature)"
          >
            <Upload size={14} /> Import Project
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-300">
              Pro
            </span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm"
          >
            <Plus size={15} /> New Project
          </motion.button>
        </div>
      </div>

      {/* Search + select-all row (list view only) */}
      {viewMode === "list" && (
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
              placeholder="Search projects..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Select-all checkbox */}
          {selectMode && filtered.length > 0 && (
            <button
              onClick={selectAll}
              className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              {allSelected
                ? <CheckSquare size={16} className="text-primary-600" />
                : <Square size={16} />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      )}

      {/* ── Galaxy View ───────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {viewMode === "galaxy" && (
          <motion.div key="galaxy"
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
            transition={{ duration:0.28, ease:[0.16,1,0.3,1] }}>
            <GalaxyView projects={myProjects} onNavigate={onNavigate}
              onCreateProject={() => setShowCreate(true)} />
          </motion.div>
        )}
        {viewMode === "list" && (
          <motion.div key="list"
            initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
            transition={{ duration:0.22, ease:[0.16,1,0.3,1] }}>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] flex items-center justify-center">
            <FolderOpen size={28} className="text-[var(--text-subtle)]" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-[var(--text)]">{search ? "No results found" : "No projects yet"}</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {search ? `No projects match "${search}"` : "Create your first project to get started"}
            </p>
          </div>
          {!search && (
            <div className="flex items-center gap-3 flex-wrap justify-center">
              <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
                <Plus size={14} /> Create Project
              </button>
              <button
                onClick={handleImportClick}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 transition-all cursor-pointer"
              >
                <Upload size={14} /> Import Project
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-300">
                  Pro
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Project grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {filtered.map((p, i) => {
            const isSelected = selected.has(p.id);
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => selectMode && toggleSelect(p.id)}
                className={cn(
                  "card p-5 flex flex-col gap-3 relative group transition-all",
                  selectMode && "cursor-pointer",
                  selectMode && isSelected && "ring-2 ring-primary-500 bg-primary-50/30 dark:bg-primary-900/20",
                  selectMode && !isSelected && "hover:ring-2 hover:ring-primary-300 dark:hover:ring-primary-700"
                )}
              >
                {p.pinned && !selectMode && (
                  <Pin size={11} className="absolute top-3 right-10 text-amber-500" />
                )}

                {/* Checkbox (select mode) */}
                {selectMode && (
                  <div className="absolute top-3 right-3 z-10">
                    {isSelected
                      ? <CheckSquare size={18} className="text-primary-600" />
                      : <Square size={18} className="text-[var(--text-subtle)]" />}
                  </div>
                )}

                {/* ⋮ menu (non-select mode) */}
                {!selectMode && (
                  <div className="absolute top-3 right-3">
                    <button
                      onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-subtle)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-all opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {menuOpen === p.id && (
                      <div className="absolute right-0 top-full mt-1 z-20 card shadow-card-lg py-1.5 w-44 rounded-xl">
                        {[
                          { icon: Edit2,    label: "Rename",                  action: () => startRename(p) },
                          { icon: Copy,     label: "Duplicate",               action: () => { duplicate(p); setMenuOpen(null); } },
                          { icon: Download, label: "Export Project",          action: () => { exportProject(p); setMenuOpen(null); } },
                          { icon: Pin,      label: p.pinned ? "Unpin" : "Pin", action: () => { togglePin(p); setMenuOpen(null); } },
                          { icon: Trash2, label: "Delete", action: () => {
                            const numericId = parseInt(user?.id ?? "", 10);
                            deleteProject(p.id, ownerId);
                            if (!isNaN(numericId)) apiDeleteProject(numericId, p.id).catch(() => {});
                            toast.success("Deleted"); setMenuOpen(null);
                          }, danger: true },
                        ].map(({ icon: Ic, label, action, danger }) => (
                          <button key={label} onClick={action}
                            className={cn("w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-[var(--surface)] transition-colors",
                              danger ? "text-red-500 hover:text-red-600" : "text-[var(--text-muted)] hover:text-[var(--text)]")}>
                            <Ic size={13} />{label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Icon */}
                <div className="w-11 h-11 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center">
                  <Database size={20} className="text-[var(--text-muted)]" />
                </div>

                {/* Name / rename */}
                {renaming === p.id ? (
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <input autoFocus value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") confirmRename(p); if (e.key === "Escape") setRenaming(null); }}
                      className="flex-1 text-sm px-2.5 py-1.5 rounded-lg border border-primary-500 bg-[var(--card)] text-[var(--text)] outline-none"
                    />
                    <button onClick={() => confirmRename(p)} className="btn-primary text-xs px-3 py-1.5">Save</button>
                  </div>
                ) : (
                  <div>
                    <p className="font-bold text-[var(--text)] truncate">{p.name}</p>
                    {p.description && <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{p.description}</p>}
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge badge-purple text-[10px] font-mono">{p.dbType}</span>
                  <span className="text-[10px] text-[var(--text-subtle)]">{p.files.length} file{p.files.length !== 1 ? "s" : ""}</span>
                  <span className="text-[10px] text-[var(--text-subtle)]">· {timeAgo(p.updatedAt)}</span>
                </div>

                {/* Open btn (non-select mode only) */}
                {!selectMode && (
                  <button
                    onClick={() => { setActiveProject(p.id); onNavigate("project-detail"); }}
                    className="btn-ghost w-full justify-center text-xs py-2 mt-auto"
                  >
                    <FolderOpen size={13} /> Open Project
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating bulk-action bar ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectMode && someSelected && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40
              flex items-center gap-3 px-5 py-3.5 rounded-2xl
              bg-[var(--card)] border border-[var(--border)] shadow-2xl"
          >
            <span className="text-sm font-semibold text-[var(--text)]">
              {selected.size} selected
            </span>
            <div className="w-px h-5 bg-[var(--border)]" />
            <button
              onClick={selectAll}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--surface)]"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <button
              onClick={() => setConfirmBulk(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
            >
              <Trash2 size={14} />
              Delete {selected.size} project{selected.size !== 1 ? "s" : ""}
            </button>
            <button onClick={exitSelectMode}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-subtle)] hover:bg-[var(--surface)] transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bulk delete confirm dialog ───────────────────────────────────────── */}
      <AnimatePresence>
        {confirmBulk && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-sm p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={20} className="text-red-500" />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text)]">Delete {selected.size} project{selected.size !== 1 ? "s" : ""}?</h3>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">This cannot be undone.</p>
                </div>
              </div>

              {/* Preview list of selected names */}
              <div className="mb-5 max-h-36 overflow-y-auto space-y-1.5 rounded-xl bg-[var(--surface)] p-3 border border-[var(--border)]">
                {filtered
                  .filter(p => selected.has(p.id))
                  .map(p => (
                    <div key={p.id} className="flex items-center gap-2 text-sm">
                      <Database size={12} className="text-primary-600 flex-shrink-0" />
                      <span className="text-[var(--text)] truncate">{p.name}</span>
                      <span className="ml-auto text-[10px] text-[var(--text-subtle)] font-mono">{p.dbType}</span>
                    </div>
                  ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setConfirmBulk(false)} className="btn-ghost flex-1 justify-center py-2.5 text-sm">
                  Cancel
                </button>
                <button
                  onClick={bulkDelete}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
                >
                  Delete all
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Create project modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="card w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-[var(--text)]">Create New Project</h2>
                <button onClick={() => setShowCreate(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--surface)] transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Project Name *</label>
                  <input className={inp} placeholder="e.g. University Database" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                    Description <span className="text-[var(--text-subtle)]">(optional)</span>
                  </label>
                  <input className={inp} placeholder="Brief project description..." value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text)] mb-1.5">Target Database</label>
                  <select value={form.dbType} onChange={e => setForm(f => ({ ...f, dbType: e.target.value as DBType }))}
                    className="w-full py-2.5 px-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all cursor-pointer">
                    {DB_TYPES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowCreate(false)} className="btn-ghost flex-1 justify-center text-sm py-2.5">Cancel</button>
                  <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    onClick={createProject} className="btn-primary flex-1 justify-center text-sm py-2.5">
                    Create Project
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ImportProjectModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImportSuccess}
        ownerId={ownerId}
      />

      <UpgradeLimitDialog
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        reason={limitReason}
        onNavigatePricing={() => onNavigate("pricing")}
      />
    </div>
  );
}
