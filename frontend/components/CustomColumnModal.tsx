"use client";
import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sliders, Sparkles, Check, AlertCircle } from "lucide-react";
import { CustomColumn } from "@/lib/types";
import { DEFAULT_DATA_TYPES } from "@/lib/customization";
import { useStore } from "@/lib/store";
import toast from "react-hot-toast";

interface CustomColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (col: Omit<CustomColumn, "id" | "createdAt">) => void;
  initialData?: CustomColumn | null;
}

export default function CustomColumnModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: CustomColumnModalProps) {
  const { sidebarCollapsed } = useStore();
  const [mounted, setMounted] = useState(false);

  const [name, setName] = useState("");
  const [dataType, setDataType] = useState("VARCHAR");
  const [defaultValue, setDefaultValue] = useState("");
  const [description, setDescription] = useState("");
  const [constraints, setConstraints] = useState({
    notNull: false,
    primaryKey: false,
    unique: false,
    indexed: false,
  });
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setDataType(initialData.dataType || "VARCHAR");
      setDefaultValue(initialData.defaultValue || "");
      setDescription(initialData.description || "");
      setConstraints({
        notNull: !!initialData.constraints?.notNull,
        primaryKey: !!initialData.constraints?.primaryKey,
        unique: !!initialData.constraints?.unique,
        indexed: !!initialData.constraints?.indexed,
      });
      setEnabled(initialData.enabled ?? true);
      setError("");
    } else {
      setName("");
      setDataType("VARCHAR");
      setDefaultValue("");
      setDescription("");
      setConstraints({
        notNull: false,
        primaryKey: false,
        unique: false,
        indexed: false,
      });
      setEnabled(true);
      setError("");
    }
  }, [initialData, isOpen]);

  // Lock background scroll when open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Close on Escape, save on Ctrl+Enter
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        handleSubmit(e as any);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, name, dataType, defaultValue, description, constraints, enabled]);

  const validateName = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return "Column name is required";
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
      return "Must start with a letter/underscore and contain only letters, numbers, underscores";
    }
    return "";
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (error) setError(validateName(val));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateName(name);
    if (err) {
      setError(err);
      toast.error(err);
      return;
    }

    onSave({
      name: name.trim().toLowerCase(),
      dataType: dataType.trim() || "VARCHAR",
      defaultValue: defaultValue.trim(),
      description: description.trim(),
      constraints,
      enabled,
    });

    toast.success(initialData ? "Custom column updated" : "Custom column added");
    onClose();
  };

  const availableDataTypes = useMemo(() => {
    const list = [...DEFAULT_DATA_TYPES];
    if (dataType && !list.includes(dataType)) {
      list.unshift(dataType);
    }
    return list;
  }, [dataType]);

  if (!mounted) return null;

  const sidebarWidth = sidebarCollapsed ? 72 : 248;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          id="custom-column-modal-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="custom-column-modal-title"
          className="fixed top-[57px] right-0 bottom-14 sm:bottom-0 left-0 lg:left-[var(--modal-sidebar-w)] z-40 flex items-center justify-center p-3 sm:p-5 overflow-hidden transition-[left] duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            "--modal-sidebar-w": `${sidebarWidth}px`,
          } as React.CSSProperties}
        >
          {/* Backdrop confined to workspace area (does not cover navbar or sidebar) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-xs cursor-pointer"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative z-10 w-full max-w-2xl max-h-[calc(100vh-57px-1.5rem)] flex flex-col rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header (Compact & Sticky) */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-[var(--surface)]/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary-500/15 flex items-center justify-center text-primary-500 shrink-0">
                  <Sliders size={17} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      id="custom-column-modal-title"
                      className="text-base font-bold text-[var(--text)] leading-tight"
                    >
                      {initialData ? "Edit Custom Column" : "Add Custom Column"}
                    </h3>
                    <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/25">
                      Schema Directive
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    Define custom schema attributes dynamically applied across AI tools
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors shrink-0"
                aria-label="Close dialog"
                title="Close (Esc)"
              >
                <X size={17} />
              </button>
            </div>

            {/* Form Body - Compact 2-column layout to fit 100% screen resolution without cut-off */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 custom-scrollbar">
                {/* Row 1: Column Name & Data Type */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Column Name */}
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      Column Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={handleNameChange}
                      placeholder="e.g., roll_number, email"
                      autoFocus
                      className={`w-full py-2 px-3 text-sm rounded-xl border ${
                        error ? "border-red-500 ring-1 ring-red-500" : "border-[var(--border)]"
                      } bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all font-mono`}
                    />
                    <p className="text-[11px] text-[var(--text-subtle)] mt-1 truncate">
                      Starts with letter/_, letters, numbers, underscores
                    </p>
                    {error && (
                      <div className="flex items-center gap-1.5 text-xs text-red-500 mt-1">
                        <AlertCircle size={13} />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>

                  {/* Data Type */}
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      Data Type <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={dataType}
                        onChange={(e) => setDataType(e.target.value)}
                        className="w-full py-2 px-3 pr-8 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all font-mono cursor-pointer appearance-none"
                      >
                        {availableDataTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-subtle)] text-xs">
                        ▼
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-subtle)] mt-1 truncate">
                      Standard SQL column datatype
                    </p>
                  </div>
                </div>

                {/* Row 2: Default Value & Description */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  {/* Default Value */}
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      Default Value
                    </label>
                    <input
                      type="text"
                      value={defaultValue}
                      onChange={(e) => setDefaultValue(e.target.value)}
                      placeholder="e.g., 'N/A', 0, CURRENT_TIMESTAMP"
                      className="w-full py-2 px-3 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all font-mono"
                    />
                    <p className="text-[11px] text-[var(--text-subtle)] mt-1 truncate">
                      Optional default SQL expression
                    </p>
                  </div>

                  {/* Description */}
                  <div className="sm:col-span-7">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                      AI Guidance &amp; Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g., Unique student identification number used by institutions"
                      className="w-full py-2 px-3 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all"
                    />
                    <p className="text-[11px] text-[var(--text-subtle)] mt-1 truncate">
                      Helps AI understand context during generation
                    </p>
                  </div>
                </div>

                {/* Row 3: Constraints Checkboxes (Compact 4-column row) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Constraints
                    </label>
                    <span className="text-[11px] text-[var(--text-subtle)]">
                      Select SQL modifiers
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { key: "notNull", label: "NOT NULL" },
                      { key: "primaryKey", label: "Primary Key" },
                      { key: "unique", label: "UNIQUE" },
                      { key: "indexed", label: "Indexed" },
                    ].map(({ key, label }) => {
                      const isChecked = constraints[key as keyof typeof constraints];
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer select-none transition-all ${
                            isChecked
                              ? "border-primary-500 bg-primary-500/10 text-[var(--text)] ring-1 ring-primary-500/30"
                              : "border-[var(--border)] bg-[var(--surface)]/40 hover:bg-[var(--surface)] text-[var(--text-muted)]"
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                              isChecked
                                ? "bg-primary-600 border-primary-600 text-white"
                                : "border-[var(--text-subtle)]/70 bg-transparent"
                            }`}
                          >
                            {isChecked && <Check size={11} strokeWidth={3} />}
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              setConstraints((prev) => ({ ...prev, [key]: e.target.checked }))
                            }
                            className="sr-only"
                          />
                          <span className="text-xs font-medium truncate">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Row 4: Enabled Toggle */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--surface)]/40 border border-[var(--border)]">
                  <div className="flex items-center gap-2.5 min-w-0 pr-3">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        enabled ? "bg-emerald-500" : "bg-gray-400"
                      }`}
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-[var(--text)] block truncate">
                        Enabled for AI Schema Generation
                      </span>
                      <p className="text-[11px] text-[var(--text-muted)] truncate">
                        Auto-applied to Quick Convert, Generate, Migrator &amp; Assistant
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-[var(--border)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600" />
                  </label>
                </div>
              </div>

              {/* Modal Actions Footer (Sticky at bottom, never cut off) */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)] bg-[var(--surface)]/60 shrink-0">
                <p className="hidden sm:block text-[11px] text-[var(--text-subtle)] font-mono">
                  Press <kbd className="px-1 py-0.5 rounded bg-[var(--card)] border border-[var(--border)] text-[10px]">Esc</kbd> to cancel
                </p>
                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary px-5 py-2 text-sm font-semibold rounded-xl flex items-center gap-1.5 shadow-sm hover:shadow transition-all"
                  >
                    <Sparkles size={15} />
                    {initialData ? "Save Changes" : "Add Column"}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

