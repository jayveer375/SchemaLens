"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock, Sun, Globe, Trash2,
  Eye, EyeOff, AlertCircle, BarChart3,
  Sliders, Plus, Edit2, Check, Sparkles,
  Info, CheckCircle2, RotateCcw
} from "lucide-react";
import { useStore } from "@/lib/store";
import { changePassword, deleteAccount } from "@/lib/auth";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import UsagePage from "@/components/pages/UsagePage";
import CustomColumnModal from "@/components/CustomColumnModal";
import { CustomColumn } from "@/lib/types";
import { PRESET_CUSTOM_COLUMNS } from "@/lib/customization";

const TABS = [
  { id: "customization", label: "Customization",   icon: Sliders },
  { id: "usage",         label: "Usage",           icon: BarChart3 },
  { id: "password",      label: "Change Password", icon: Lock },
  { id: "theme",         label: "Appearance",       icon: Sun },
  { id: "language",      label: "Language",         icon: Globe },
  { id: "danger",        label: "Delete Account",   icon: Trash2, danger: true },
];

export default function SettingsPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const {
    user, theme, setTheme, selectedLanguage, setSelectedLanguage, logout,
    customColumns, addCustomColumn, updateCustomColumn, deleteCustomColumn,
    toggleCustomColumn, globalPromptRules, setGlobalPromptRules,
    autoApplyToAllTools, setAutoApplyToAllTools, resetCustomColumnsToPresets,
  } = useStore();

  const [tab, setTab]         = useState("customization");
  const [saving, setSaving]   = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCol, setEditingCol]   = useState<CustomColumn | null>(null);
  const [tempRules, setTempRules]     = useState(globalPromptRules || "");

  const [pw,      setPw]      = useState({ current: "", next: "", confirm: "" });
  const [showPw,  setShowPw]  = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const inp =
    "w-full py-2.5 px-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] " +
    "text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none " +
    "focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all";

  const savePassword = async () => {
    if (!user) return;
    if (pw.next !== pw.confirm) { toast.error("Passwords don't match"); return; }
    if (pw.next.length < 8)     { toast.error("Password must be at least 8 characters"); return; }
    setSaving(true);
    try {
      await changePassword(user.id, pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password changed!");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!user || deleteConfirm !== "DELETE") { toast.error('Type "DELETE" to confirm'); return; }
    setSaving(true);
    try {
      await deleteAccount(user.id);
      logout();
      toast.success("Account deleted");
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleOpenAddModal = () => {
    setEditingCol(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (col: CustomColumn) => {
    setEditingCol(col);
    setIsModalOpen(true);
  };

  const handleSaveColumn = (data: Omit<CustomColumn, "id" | "createdAt">) => {
    if (editingCol) {
      updateCustomColumn(editingCol.id, data);
    } else {
      addCustomColumn(data);
    }
  };

  const handleSaveGlobalRules = () => {
    setGlobalPromptRules(tempRules);
    toast.success("Custom schema rules saved");
  };

  const activeColumnsCount = (customColumns || []).filter((c) => c.enabled).length;

  const Row = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-4 border-b border-[var(--border)] last:border-none">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-base font-medium text-[var(--text)]">{label}</p>
        {desc && <p className="text-sm text-[var(--text-muted)] mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text)]">Settings</h1>
        <p className="text-base text-[var(--text-muted)] mt-1">Manage your account preferences and AI customizations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar tab list */}
        <div className="card p-2 h-fit">
          {TABS.map(({ id, label, icon: Icon, danger }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-base font-medium transition-all",
                tab === id
                  ? danger
                    ? "bg-red-50 dark:bg-red-500/10 text-red-600"
                    : theme === "dark" ? "text-black" : "text-white"
                  : danger
                    ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                    : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              )}
              style={tab === id && !danger ? { background: "var(--primary)" } : undefined}
            >
              <Icon size={17} />{label}
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div className="card p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >

              {/* ── Customization ── */}
              {tab === "customization" && (
                <div className="space-y-6">
                  {/* Top Bar / Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border)]">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl font-bold text-[var(--text)]">Customization & Schema Rules</h2>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/30">
                          <Sparkles size={12} />
                          {activeColumnsCount} Active
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] mt-1">
                        Define custom columns and directives that AI dynamically applies across all tools.
                      </p>
                    </div>

                    <button
                      onClick={handleOpenAddModal}
                      className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl whitespace-nowrap shadow-sm hover:shadow transition-all"
                    >
                      <Plus size={16} />
                      Add Custom Column
                    </button>
                  </div>

                  {/* All Tools Active Banner */}
                  <div className="p-4 rounded-xl border border-primary-500/25 bg-primary-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
                        <CheckCircle2 size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[var(--text)]">
                          Dynamic Multi-Tool Integration
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          Active columns are automatically fed to: <span className="font-medium text-[var(--text)]">Quick Convert</span>, <span className="font-medium text-[var(--text)]">Generate</span>, <span className="font-medium text-[var(--text)]">Migrator</span>, <span className="font-medium text-[var(--text)]">AI Assistant</span>, and <span className="font-medium text-[var(--text)]">Playground</span>.
                        </p>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer self-start sm:self-auto bg-[var(--card)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
                      <input
                        type="checkbox"
                        checked={autoApplyToAllTools}
                        onChange={(e) => setAutoApplyToAllTools(e.target.checked)}
                        className="rounded border-[var(--border)] text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-xs font-medium text-[var(--text)]">Auto-apply enabled</span>
                    </label>
                  </div>

                  {/* Custom Columns List */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        Configured Custom Columns ({customColumns?.length || 0})
                      </h3>
                      {customColumns && customColumns.length > 0 && (
                        <button
                          onClick={resetCustomColumnsToPresets}
                          className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] flex items-center gap-1 transition-colors"
                          title="Restore default presets"
                        >
                          <RotateCcw size={12} />
                          Reset to presets
                        </button>
                      )}
                    </div>

                    {(!customColumns || customColumns.length === 0) ? (
                      <div className="text-center py-10 px-4 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface)]/30">
                        <div className="w-12 h-12 rounded-2xl bg-primary-500/10 text-primary-500 flex items-center justify-center mx-auto mb-3">
                          <Sliders size={24} />
                        </div>
                        <h4 className="text-base font-semibold text-[var(--text)]">No Custom Columns Configured</h4>
                        <p className="text-sm text-[var(--text-muted)] max-w-sm mx-auto mt-1 mb-4">
                          Add custom columns like roll_number, audit timestamps, or tenant IDs that you want the AI to always include in generated schemas.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={handleOpenAddModal}
                            className="btn-primary text-sm px-4 py-2 rounded-xl flex items-center gap-2"
                          >
                            <Plus size={15} />
                            Add Custom Column
                          </button>
                          <button
                            onClick={resetCustomColumnsToPresets}
                            className="btn-ghost text-sm px-4 py-2 rounded-xl border border-[var(--border)]"
                          >
                            Load Presets
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {customColumns.map((col) => {
                          const hasConstraints =
                            col.constraints?.notNull ||
                            col.constraints?.primaryKey ||
                            col.constraints?.unique ||
                            col.constraints?.indexed;

                          return (
                            <div
                              key={col.id}
                              className={`p-4 rounded-xl border transition-all ${
                                col.enabled
                                  ? "border-[var(--border)] bg-[var(--card)] hover:border-primary-500/40"
                                  : "border-[var(--border)]/60 bg-[var(--surface)]/40 opacity-70"
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1.5 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono font-bold text-base text-[var(--text)]">
                                      {col.name}
                                    </span>
                                    <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                      {col.dataType}
                                    </span>
                                    {col.constraints?.primaryKey && (
                                      <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                        PK
                                      </span>
                                    )}
                                    {col.constraints?.notNull && (
                                      <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                        NOT NULL
                                      </span>
                                    )}
                                    {col.constraints?.unique && (
                                      <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                        UNIQUE
                                      </span>
                                    )}
                                    {col.constraints?.indexed && (
                                      <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                                        INDEXED
                                      </span>
                                    )}
                                    {col.defaultValue && (
                                      <span className="px-2 py-0.5 text-xs font-mono rounded-md bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]">
                                        DEFAULT: {col.defaultValue}
                                      </span>
                                    )}
                                  </div>

                                  {col.description && (
                                    <p className="text-sm text-[var(--text-muted)] line-clamp-2">
                                      {col.description}
                                    </p>
                                  )}
                                </div>

                                {/* Actions & Enable Toggle */}
                                <div className="flex items-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border)]">
                                  <label className="flex items-center gap-2 cursor-pointer pr-2 border-r border-[var(--border)]">
                                    <input
                                      type="checkbox"
                                      checked={col.enabled}
                                      onChange={() => toggleCustomColumn(col.id)}
                                      className="sr-only"
                                    />
                                    <div
                                      className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                                        col.enabled ? "bg-primary-600" : "bg-[var(--border)]"
                                      }`}
                                    >
                                      <div
                                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                          col.enabled ? "translate-x-4" : "translate-x-0"
                                        }`}
                                      />
                                    </div>
                                    <span className="text-xs font-medium text-[var(--text-muted)]">
                                      {col.enabled ? "Active" : "Off"}
                                    </span>
                                  </label>

                                  <button
                                    onClick={() => handleOpenEditModal(col)}
                                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                                    title="Edit Column"
                                  >
                                    <Edit2 size={16} />
                                  </button>

                                  <button
                                    onClick={() => {
                                      deleteCustomColumn(col.id);
                                      toast.success(`Removed column "${col.name}"`);
                                    }}
                                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                    title="Delete Column"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Preset Templates */}
                  <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 space-y-3">
                    <h4 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                      <Sparkles size={15} className="text-primary-500" />
                      Quick Preset Suggestions
                    </h4>
                    <p className="text-xs text-[var(--text-muted)]">
                      Click any preset below to quickly add standard enterprise schema columns:
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {PRESET_CUSTOM_COLUMNS.map((preset) => {
                        const exists = customColumns?.some((c) => c.name === preset.name);
                        return (
                          <button
                            key={preset.name}
                            disabled={exists}
                            onClick={() => {
                              addCustomColumn(preset);
                              toast.success(`Added preset "${preset.name}"`);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-all ${
                              exists
                                ? "border-transparent bg-[var(--card)] text-[var(--text-subtle)] opacity-50 cursor-not-allowed"
                                : "border-[var(--border)] bg-[var(--card)] hover:border-primary-500/50 hover:text-primary-500 text-[var(--text)]"
                            }`}
                          >
                            <Plus size={13} />
                            <span className="font-mono">{preset.name}</span>
                            <span className="text-[var(--text-subtle)]">({preset.dataType})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Global Custom Instructions */}
                  <div className="pt-4 border-t border-[var(--border)] space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text)]">
                        Additional Global Schema Directives (Optional)
                      </h4>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Provide custom system guidelines that AI will strictly follow when generating or converting DDL.
                      </p>
                    </div>
                    <textarea
                      rows={3}
                      value={tempRules}
                      onChange={(e) => setTempRules(e.target.value)}
                      placeholder="e.g., Always use snake_case for table and column names. Always create indexes for foreign key columns. Add a composite primary key for junction tables."
                      className={inp}
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveGlobalRules}
                        className="btn-primary px-4 py-2 text-xs font-semibold rounded-xl"
                      >
                        Save Directives
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Usage ── */}
              {tab === "usage" && (
                <UsagePage onNavigate={onNavigate} />
              )}

              {/* ── Change Password ── */}
              {tab === "password" && (
                <div>
                  <h2 className="text-lg font-bold text-[var(--text)] mb-5">Change Password</h2>
                  <div className="space-y-4 max-w-sm">
                    {[
                      { label: "Current Password",     key: "current", val: pw.current },
                      { label: "New Password",          key: "next",    val: pw.next },
                      { label: "Confirm New Password",  key: "confirm", val: pw.confirm },
                    ].map(({ label, key, val }) => (
                      <div key={key}>
                    <label className="block text-base font-medium text-[var(--text)] mb-1.5">{label}</label>
                        <div className="relative">
                          <input
                            type={showPw ? "text" : "password"}
                            className={`${inp} pr-10`}
                            placeholder="••••••••"
                            value={val}
                            onChange={(e) => setPw((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          {key === "current" && (
                            <button
                              type="button"
                              onClick={() => setShowPw(!showPw)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
                            >
                              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <button onClick={savePassword} disabled={saving} className="btn-primary text-base disabled:opacity-60">
                      {saving ? "Saving…" : "Update Password"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Appearance ── */}
              {tab === "theme" && (
                <div>
                  <h2 className="text-lg font-bold text-[var(--text)] mb-5">Appearance</h2>
                  <Row label="Theme" desc="Choose your interface color scheme">
                    <div className="flex items-center gap-2">
                      {(["light", "dark"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={cn(
                            "px-4 py-2.5 rounded-xl text-base font-medium border transition-all",
                            theme === t ? "bg-primary-600 text-white border-primary-600" : "btn-ghost"
                          )}
                        >
                          {t === "light" ? "☀️ Light" : "🌙 Dark"}
                        </button>
                      ))}
                    </div>
                  </Row>
                </div>
              )}

              {/* ── Language ── */}
              {tab === "language" && (
                <div>
                  <h2 className="text-lg font-bold text-[var(--text)] mb-5">Language</h2>
                  <Row label="Default SQL Output" desc="Default language shown in the code editor">
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="py-2.5 px-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 cursor-pointer"
                    >
                      {["postgresql","mysql","sqlite","mssql","oracle"].map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  </Row>
                </div>
              )}

              {/* ── Delete Account ── */}
              {tab === "danger" && (
                <div>
                  <h2 className="text-lg font-bold text-red-500 mb-2">Delete Account</h2>
                  <p className="text-sm text-[var(--text-muted)] mb-6">
                    This will permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  <div className="p-4 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 mb-5">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-600 dark:text-red-400">
                        <strong>Warning:</strong> All projects, files, and generated SQL will be permanently deleted.
                      </p>
                    </div>
                  </div>
                  <div className="max-w-sm space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                        Type <span className="font-mono font-bold">DELETE</span> to confirm
                      </label>
                      <input
                        className={inp}
                        placeholder="DELETE"
                        value={deleteConfirm}
                        onChange={(e) => setDeleteConfirm(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={handleDelete}
                      disabled={saving || deleteConfirm !== "DELETE"}
                      className="w-full py-2.5 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {saving ? "Deleting…" : "Permanently Delete Account"}
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Add / Edit Custom Column Modal */}
      <CustomColumnModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveColumn}
        initialData={editingCol}
      />
    </div>
  );
}

