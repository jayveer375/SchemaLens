"use client";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Settings, Sparkles, Check, AlertCircle } from "lucide-react";
import { CustomColumn } from "@/lib/types";
import { DEFAULT_DATA_TYPES } from "@/lib/customization";
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

  const validateName = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return "Column name is required";
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
      return "Must start with a letter or underscore, contain only letters, numbers, and underscores";
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

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative w-full max-w-lg rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl overflow-hidden my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface)]/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-primary-500/15 flex items-center justify-center text-primary-500">
                <Settings size={18} />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text)]">
                {initialData ? "Edit Custom Column" : "Add Custom Column"}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Column Name */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                Column Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={handleNameChange}
                placeholder="e.g., roll_number, email, phone_number"
                className={`w-full py-2.5 px-4 text-sm rounded-xl border ${
                  error ? "border-red-500 ring-1 ring-red-500" : "border-[var(--border)]"
                } bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all font-mono`}
              />
              <p className="text-xs text-[var(--text-subtle)] mt-1.5">
                Must start with a letter or underscore, contain only letters, numbers, and underscores
              </p>
              {error && (
                <div className="flex items-center gap-1.5 text-xs text-red-500 mt-1">
                  <AlertCircle size={13} />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Data Type */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                Data Type <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={dataType}
                  onChange={(e) => setDataType(e.target.value)}
                  className="w-full py-2.5 px-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all font-mono cursor-pointer appearance-none pr-10"
                >
                  {DEFAULT_DATA_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-subtle)] text-xs">
                  ▼
                </div>
              </div>
            </div>

            {/* Default Value */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                Default Value
              </label>
              <input
                type="text"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                placeholder="e.g., 'N/A', 0, CURRENT_TIMESTAMP"
                className="w-full py-2.5 px-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all font-mono"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">
                Description
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe when this column should be used. This helps AI understand its context."
                className="w-full py-2.5 px-4 text-sm rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:border-primary-500 transition-all resize-none"
              />
              <p className="text-xs text-[var(--text-subtle)] mt-1">
                e.g., &quot;Unique student identification number used by educational institutions&quot;
              </p>
            </div>

            {/* Constraints Checkboxes */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">
                Constraints
              </label>
              <div className="grid grid-cols-2 gap-3">
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
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        isChecked
                          ? "border-primary-500 bg-primary-500/10 text-[var(--text)]"
                          : "border-[var(--border)] bg-[var(--surface)]/50 hover:bg-[var(--surface)] text-[var(--text-muted)]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                          isChecked
                            ? "bg-primary-600 border-primary-600 text-white"
                            : "border-[var(--text-subtle)] bg-transparent"
                        }`}
                      >
                        {isChecked && <Check size={12} strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) =>
                          setConstraints((prev) => ({ ...prev, [key]: e.target.checked }))
                        }
                        className="sr-only"
                      />
                      <span className="text-sm font-medium">{label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Enabled toggle */}
            <div className="pt-2 border-t border-[var(--border)]">
              <label className="flex items-start gap-3 cursor-pointer">
                <div
                  className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                    enabled
                      ? "bg-primary-600 border-primary-600 text-white"
                      : "border-[var(--text-subtle)] bg-transparent"
                  }`}
                >
                  {enabled && <Check size={12} strokeWidth={3} />}
                </div>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--text)]">Enabled</span>
                  <p className="text-xs text-[var(--text-muted)]">
                    When enabled, this column will be considered in schema generation across all tools.
                  </p>
                </div>
              </label>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary px-5 py-2.5 text-sm font-semibold rounded-xl flex items-center gap-2"
              >
                <Sparkles size={16} />
                {initialData ? "Save Changes" : "Add Column"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
