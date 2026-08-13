/**
 * schemaAnalyzer.ts
 * Pure local SQL schema analysis — no API, no external deps.
 * Reuses parseSQLSchema from the existing sqlParser.ts.
 *
 * Detects:
 *  Errors   – hard design problems (missing PKs, broken FK refs, duplicate cols)
 *  Warnings – likely issues (FK column not indexed, suspicious nullable, isolated tables)
 *  Suggestions – best-practice improvements (naming, indexes, normalization hints)
 */

import { parseSQLSchema, type Schema, type Table, type Column } from "./sqlParser";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type FindingSeverity = "error" | "warning" | "suggestion";

export interface AnalysisFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  table?: string;          // which table this relates to (optional)
  column?: string;         // which column this relates to (optional)
  fixHint?: string;        // short actionable hint shown in the UI
}

export interface AnalysisResult {
  errors:      AnalysisFinding[];
  warnings:    AnalysisFinding[];
  suggestions: AnalysisFinding[];
  tableCount:  number;
  columnCount: number;
  fkCount:     number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 0;
function id(prefix: string) { return `${prefix}-${++_seq}`; }

/** Column names that are almost always nullable by accident */
const SUSPICIOUS_NULLABLE_PATTERNS = [
  /^(email|username|user_name|login|password|name|title|status)$/i,
];

/** Prefixes/suffixes that hint at a FK column */
const FK_HINT_SUFFIX = /_id$/i;
const FK_HINT_PREFIX = /^(fk_|ref_)/i;

/** Common snake_case → camelCase inconsistency signal */
const CAMEL_CASE_RE = /[a-z][A-Z]/;
const SNAKE_CASE_RE = /_/;

function tableNames(schema: Schema): Set<string> {
  return new Set(schema.tables.map(t => t.name.toLowerCase()));
}

function hasPK(table: Table): boolean {
  return table.columns.some(c => c.isPrimaryKey);
}

function colNames(table: Table): string[] {
  return table.columns.map(c => c.name.toLowerCase());
}

/** True if the column type hints it can be NULL (no NOT NULL in type string) */
function looksNullable(col: Column): boolean {
  // parseSQLSchema stores the raw type string which may include modifiers like NOT NULL
  // Check both the type field and treat absence of NOT NULL as potentially nullable
  return !/NOT\s*NULL/i.test(col.type) && !col.isPrimaryKey;
}

function isFKByNamingConvention(col: Column): boolean {
  return FK_HINT_SUFFIX.test(col.name) || FK_HINT_PREFIX.test(col.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main analyser
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeSchema(sql: string): AnalysisResult {
  _seq = 0; // reset id counter so results are deterministic per call

  const errors:      AnalysisFinding[] = [];
  const warnings:    AnalysisFinding[] = [];
  const suggestions: AnalysisFinding[] = [];

  // Guard: nothing to parse
  if (!sql || !sql.trim()) {
    errors.push({
      id: id("e"),
      severity: "error",
      title: "No schema provided",
      detail: "Create or load a database schema first. Use Quick Convert, Generate, or the SQL Playground.",
      fixHint: "Load a schema",
    });
    return { errors, warnings, suggestions, tableCount: 0, columnCount: 0, fkCount: 0 };
  }

  const schema = parseSQLSchema(sql);

  if (schema.tables.length === 0) {
    errors.push({
      id: id("e"),
      severity: "error",
      title: "No tables found",
      detail: "The schema text was parsed but no CREATE TABLE statements were detected. Check for syntax errors.",
      fixHint: "Check SQL syntax",
    });
    return { errors, warnings, suggestions, tableCount: 0, columnCount: 0, fkCount: 0 };
  }

  const knownTableNames = tableNames(schema);
  const fkCount = schema.relationships.length;
  const columnCount = schema.tables.reduce((s, t) => s + t.columns.length, 0);

  // Track naming style across all tables for consistency check
  const nameStyles = { snake: 0, camel: 0 };

  for (const table of schema.tables) {
    // ── Style detection ─────────────────────────────────────────────────────
    for (const col of table.columns) {
      if (SNAKE_CASE_RE.test(col.name)) nameStyles.snake++;
      if (CAMEL_CASE_RE.test(col.name)) nameStyles.camel++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // ERROR: Missing primary key
    // ─────────────────────────────────────────────────────────────────────
    if (!hasPK(table)) {
      errors.push({
        id: id("e"),
        severity: "error",
        title: `Missing PRIMARY KEY on "${table.name}"`,
        detail: `Table "${table.name}" has no primary key. Every table should have a primary key for unique row identification and efficient joins.`,
        table: table.name,
        fixHint: `Add id ${table.name.toLowerCase()}_id PRIMARY KEY`,
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ERROR: Duplicate column names within a table
    // ─────────────────────────────────────────────────────────────────────
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const col of table.columns) {
      const lower = col.name.toLowerCase();
      if (seen.has(lower)) dupes.add(lower);
      seen.add(lower);
    }
    for (const dupe of dupes) {
      errors.push({
        id: id("e"),
        severity: "error",
        title: `Duplicate column "${dupe}" in "${table.name}"`,
        detail: `Column "${dupe}" appears more than once in table "${table.name}". This will cause a runtime error when the schema is executed.`,
        table: table.name,
        column: dupe,
        fixHint: "Remove or rename the duplicate column",
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ERROR: FK references a table that doesn't exist in the schema
    // ─────────────────────────────────────────────────────────────────────
    for (const col of table.columns) {
      if (col.isForeignKey && col.references) {
        const refTable = col.references.table.toLowerCase();
        if (!knownTableNames.has(refTable)) {
          errors.push({
            id: id("e"),
            severity: "error",
            title: `FK "${col.name}" references unknown table "${col.references.table}"`,
            detail: `Column "${table.name}.${col.name}" has a FOREIGN KEY to "${col.references.table}" but that table is not defined in this schema.`,
            table: table.name,
            column: col.name,
            fixHint: `Create table "${col.references.table}" or check the reference`,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // WARNING: Column looks like a FK by naming but has no FK constraint
    // ─────────────────────────────────────────────────────────────────────
    for (const col of table.columns) {
      if (!col.isForeignKey && isFKByNamingConvention(col) && !col.isPrimaryKey) {
        warnings.push({
          id: id("w"),
          severity: "warning",
          title: `"${table.name}.${col.name}" looks like an FK but has no constraint`,
          detail: `The column name "${col.name}" suggests a foreign key relationship but no FOREIGN KEY constraint is declared. This can lead to orphan rows and broken relationships.`,
          table: table.name,
          column: col.name,
          fixHint: `ADD CONSTRAINT fk_${table.name.toLowerCase()}_${col.name} FOREIGN KEY (${col.name}) REFERENCES …`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // WARNING: FK column likely has no index
    // ─────────────────────────────────────────────────────────────────────
    for (const col of table.columns) {
      if (col.isForeignKey && !col.isPrimaryKey) {
        warnings.push({
          id: id("w"),
          severity: "warning",
          title: `No index on FK column "${table.name}.${col.name}"`,
          detail: `Foreign key columns are used in JOIN conditions and should be indexed. "${table.name}.${col.name}" has no explicit index, which can slow down queries significantly.`,
          table: table.name,
          column: col.name,
          fixHint: `CREATE INDEX idx_${table.name.toLowerCase()}_${col.name} ON ${table.name}(${col.name});`,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // WARNING: Suspicious nullable on critical columns
    // ─────────────────────────────────────────────────────────────────────
    for (const col of table.columns) {
      if (looksNullable(col)) {
        if (SUSPICIOUS_NULLABLE_PATTERNS.some(p => p.test(col.name))) {
          warnings.push({
            id: id("w"),
            severity: "warning",
            title: `"${table.name}.${col.name}" may be unintentionally nullable`,
            detail: `Columns like "${col.name}" are almost always required. Marking it NOT NULL prevents invalid data and makes intent explicit.`,
            table: table.name,
            column: col.name,
            fixHint: `ALTER TABLE ${table.name} ALTER COLUMN ${col.name} SET NOT NULL;`,
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // SUGGESTION: Table with no relationships (isolated table)
    // ─────────────────────────────────────────────────────────────────────
    if (schema.tables.length > 1) {
      const tableNameLower = table.name.toLowerCase();
      const isConnected = schema.relationships.some(
        r => r.fromTable.toLowerCase() === tableNameLower ||
             r.toTable.toLowerCase() === tableNameLower
      );
      if (!isConnected) {
        suggestions.push({
          id: id("s"),
          severity: "suggestion",
          title: `Table "${table.name}" has no relationships`,
          detail: `"${table.name}" is not linked to any other table. If this is intentional (e.g. a lookup/config table), you can ignore this. Otherwise, consider adding foreign keys.`,
          table: table.name,
          fixHint: "Review and add FOREIGN KEY constraints if needed",
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // SUGGESTION: Table with many columns (normalization hint)
    // ─────────────────────────────────────────────────────────────────────
    if (table.columns.length > 12) {
      suggestions.push({
        id: id("s"),
        severity: "suggestion",
        title: `"${table.name}" has ${table.columns.length} columns — consider splitting`,
        detail: `Tables with many columns can be a sign of poor normalization. Consider splitting "${table.name}" into related sub-tables (e.g. separating address, profile, or settings data).`,
        table: table.name,
        fixHint: "Review for normalization opportunities (2NF / 3NF)",
      });
    }
  }

  // ── SUGGESTION: Mixed naming conventions ──────────────────────────────────
  if (nameStyles.snake > 0 && nameStyles.camel > 0) {
    suggestions.push({
      id: id("s"),
      severity: "suggestion",
      title: "Mixed naming conventions detected",
      detail: `Some columns use snake_case and others use camelCase. Consistent naming improves readability and prevents subtle bugs in ORMs.`,
      fixHint: "Standardise on snake_case (SQL convention) or camelCase (ORM convention)",
    });
  }

  // ── SUGGESTION: No foreign keys at all ───────────────────────────────────
  if (schema.tables.length > 1 && fkCount === 0) {
    suggestions.push({
      id: id("s"),
      severity: "suggestion",
      title: "No foreign key constraints defined",
      detail: `The schema has ${schema.tables.length} tables but no FOREIGN KEY constraints. Without FKs the database cannot enforce referential integrity automatically.`,
      fixHint: "Add FOREIGN KEY constraints between related tables",
    });
  }

  return {
    errors,
    warnings,
    suggestions,
    tableCount: schema.tables.length,
    columnCount,
    fkCount,
  };
}

/** Generate schema-aware response when AI backend API key is missing or fails */
export function generateSchemaAwareMockResponse(
  question: string,
  schema: Schema
): { prose: string; sql?: string } {
  const q = question.toLowerCase();
  const hasSchema = schema.tables.length > 0;

  if (!hasSchema) {
    return {
      prose:
        "Query Purpose: General SQL & Database Design Assistant\n\nNo database schema is currently connected. Once you load a project with DDL files or write SQL in the Playground, I will provide schema-specific analysis.",
      sql: `-- General SQL Query Example\nSELECT \n  id, \n  name, \n  created_at \nFROM example_table \nWHERE status = 'active';`,
    };
  }

  const tableNames = schema.tables.map((t) => t.name).join(", ");

  if (q.includes("explain") || q.includes("schema") || q.includes("database")) {
    const tableBreakdown = schema.tables
      .map((t) => {
        const pk = t.columns.filter((c) => c.isPrimaryKey).map((c) => c.name).join(", ") || "None";
        const fks = t.columns.filter((c) => c.isForeignKey).map((c) => `${c.name} → ${c.references?.table}`).join(", ") || "None";
        return `- **\`${t.name}\`** (${t.columns.length} columns)\n  - Primary Key: \`${pk}\`\n  - Foreign Keys: ${fks}`;
      })
      .join("\n");

    const sampleTable = schema.tables[0];
    const sampleCols = sampleTable.columns.slice(0, 3).map((c) => c.name).join(", ");

    return {
      prose: `Query Purpose: Connected Database Schema Overview\n\nTables Involved: \`${tableNames}\`\n\nYour database contains **${schema.tables.length} table${schema.tables.length !== 1 ? "s" : ""}** and **${schema.relationships.length} relationship${schema.relationships.length !== 1 ? "s" : ""}**:\n\n${tableBreakdown}`,
      sql: `SELECT \n  ${sampleCols}\nFROM ${sampleTable.name}\nLIMIT 10;`,
    };
  }

  if (q.includes("relationship") || q.includes("foreign key") || q.includes("connect")) {
    if (schema.relationships.length === 0) {
      return {
        prose: `Query Purpose: Schema Relationships Analysis\n\nTables Involved: \`${tableNames}\`\n\nJOIN Explanation: Currently, **no explicit foreign key relationships** were detected between your connected tables (${tableNames}).\n\nPerformance Notes: Add \`FOREIGN KEY\` constraints between matching ID fields to maintain referential integrity and speed up joins.`,
        sql: schema.tables.length >= 2
          ? `ALTER TABLE ${schema.tables[1].name}\n  ADD CONSTRAINT fk_${schema.tables[1].name}_ref\n  FOREIGN KEY (${schema.tables[1].columns[0]?.name || "id"}) REFERENCES ${schema.tables[0].name}(id);`
          : undefined,
      };
    }

    const relList = schema.relationships
      .map((r) => `- **\`${r.fromTable}.${r.fromColumn}\`** → **\`${r.toTable}.${r.toColumn}\`** (${r.cardinality})`)
      .join("\n");

    const firstRel = schema.relationships[0];

    return {
      prose: `Query Purpose: Active Database Relationships Analysis\n\nTables Involved: \`${tableNames}\`\n\nJOIN Explanation:\n${relList}\n\nPerformance Notes: Foreign key columns are indexed for optimal JOIN speed.`,
      sql: `SELECT \n  a.*,\n  b.*\nFROM ${firstRel.fromTable} a\nJOIN ${firstRel.toTable} b ON a.${firstRel.fromColumn} = b.${firstRel.toColumn};`,
    };
  }

  if (q.includes("find") || q.includes("query") || q.includes("how can i") || q.includes("index")) {
    const mainTable = schema.tables[0];
    const firstCol = mainTable.columns[0]?.name || "id";
    const secondCol = mainTable.columns[1]?.name || "name";

    return {
      prose: `Query Purpose: Query optimization and index recommendation for \`${mainTable.name}\` table.\n\nTables Involved: \`${mainTable.name}\`\n\nFiltering: Filters non-null \`${firstCol}\` values ordered descending.\n\nPerformance Notes: Ensure an index exists on \`${mainTable.name}(${firstCol})\`.`,
      sql: `SELECT \n  ${firstCol},\n  ${secondCol}\nFROM ${mainTable.name}\nWHERE ${firstCol} IS NOT NULL\nORDER BY ${firstCol} DESC;`,
    };
  }

  const primaryTable = schema.tables[0].name;
  return {
    prose: `Query Purpose: Database Schema Analysis for question "${question}"\n\nTables Involved: \`${tableNames}\`\n\nConnected Context: Provided schema contains ${schema.tables.length} tables (${tableNames}).\n\nPerformance Notes: Ensure indexes exist on primary and foreign key columns.`,
    sql: `SELECT * FROM ${primaryTable} LIMIT 10;`,
  };
}
