import { CustomColumn } from "./types";

export const DEFAULT_DATA_TYPES = [
  "VARCHAR",
  "VARCHAR(255)",
  "TEXT",
  "INTEGER",
  "BIGINT",
  "BOOLEAN",
  "TIMESTAMP",
  "DATE",
  "DECIMAL(10,2)",
  "UUID",
  "FLOAT",
  "JSONB",
];

export const PRESET_CUSTOM_COLUMNS: Omit<CustomColumn, "id" | "createdAt">[] = [
  {
    name: "roll_number",
    dataType: "VARCHAR(50)",
    defaultValue: "",
    description: "Unique student or candidate identification number used by academic / educational institutions",
    constraints: { notNull: true, primaryKey: false, unique: true, indexed: true },
    enabled: true,
  },
  {
    name: "created_at",
    dataType: "TIMESTAMP",
    defaultValue: "CURRENT_TIMESTAMP",
    description: "Timestamp when record was initially created for audit trail",
    constraints: { notNull: true, primaryKey: false, unique: false, indexed: false },
    enabled: true,
  },
  {
    name: "updated_at",
    dataType: "TIMESTAMP",
    defaultValue: "CURRENT_TIMESTAMP",
    description: "Timestamp when record was last updated",
    constraints: { notNull: true, primaryKey: false, unique: false, indexed: false },
    enabled: true,
  },
  {
    name: "tenant_id",
    dataType: "UUID",
    defaultValue: "",
    description: "Multi-tenant partition identifier for enterprise SaaS isolation",
    constraints: { notNull: true, primaryKey: false, unique: false, indexed: true },
    enabled: false,
  },
  {
    name: "is_deleted",
    dataType: "BOOLEAN",
    defaultValue: "FALSE",
    description: "Soft deletion flag to prevent permanent data loss",
    constraints: { notNull: true, primaryKey: false, unique: false, indexed: true },
    enabled: false,
  },
];

/**
 * Builds a prompt section describing user's active custom columns and rules
 * to inject into AI prompts (Quick Convert, Generate, Migrate, Assistant, etc.)
 */
export function buildCustomColumnsPrompt(columns: CustomColumn[] = [], globalRules: string = ""): string {
  const active = columns.filter((c) => c && c.enabled);
  if (active.length === 0 && !globalRules?.trim()) {
    return "";
  }

  let prompt = "\n\n════ USER CUSTOMIZATION & CUSTOM COLUMNS (MANDATORY APPLIED) ════\n";
  prompt += "The user has configured the following custom columns and schema directives.\n";
  prompt += "You MUST apply and incorporate these custom columns in all generated tables/entities whenever relevant or requested:\n\n";

  if (active.length > 0) {
    prompt += "Active Custom Columns:\n";
    active.forEach((col, idx) => {
      const constraints: string[] = [];
      if (col.constraints?.primaryKey) constraints.push("PRIMARY KEY");
      if (col.constraints?.notNull) constraints.push("NOT NULL");
      if (col.constraints?.unique) constraints.push("UNIQUE");
      if (col.constraints?.indexed) constraints.push("INDEXED");
      const constraintStr = constraints.length > 0 ? ` [${constraints.join(", ")}]` : "";
      const defaultStr = col.defaultValue?.trim() ? ` DEFAULT ${col.defaultValue.trim()}` : "";
      const descStr = col.description?.trim() ? ` — Usage/Context: ${col.description.trim()}` : "";

      prompt += `${idx + 1}. Column \`${col.name}\` (${col.dataType})${constraintStr}${defaultStr}${descStr}\n`;
    });

    prompt += "\nSpecific Instructions for Custom Columns:\n";
    prompt += "- Check each table or entity being created, converted, or migrated.\n";
    prompt += "- If an entity represents or interacts with the context described in a custom column (or whenever creating entity tables), include this column.\n";
    prompt += "- Strictly respect the defined data type, constraints (PRIMARY KEY, NOT NULL, UNIQUE, etc.) and default values.\n";
  }

  if (globalRules?.trim()) {
    prompt += `\nAdditional Global Schema Rules:\n${globalRules.trim()}\n`;
  }

  prompt += "═════════════════════════════════════════════════════════════════\n";
  return prompt;
}
