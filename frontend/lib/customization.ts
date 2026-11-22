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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a compact, low-token prompt section instructing the AI to inject user's active
 * custom columns into EVERY table and entity unconditionally.
 */
export function buildCustomColumnsPrompt(columns: CustomColumn[] = [], globalRules: string = ""): string {
  const active = (columns || []).filter((c) => c && c.enabled);
  if (active.length === 0 && !globalRules?.trim()) {
    return "";
  }

  let prompt = "\n\n════ USER CONFIGURED CUSTOM COLUMNS (MANDATORY IN EVERY TABLE) ════\n";
  if (active.length > 0) {
    prompt += "CRITICAL: The following custom column(s) MUST be included in EACH AND EVERY table/entity defined in the script and diagram, whether mentioned or drawn or not:\n";
    active.forEach((col, idx) => {
      const constraints: string[] = [];
      if (col.constraints?.primaryKey) constraints.push("PRIMARY KEY");
      if (col.constraints?.notNull && !col.constraints?.primaryKey) constraints.push("NOT NULL");
      if (col.constraints?.unique && !col.constraints?.primaryKey) constraints.push("UNIQUE");
      if (col.constraints?.indexed) constraints.push("INDEXED");
      const constraintStr = constraints.length > 0 ? ` [${constraints.join(", ")}]` : "";
      
      let defaultStr = "";
      if (col.defaultValue && col.defaultValue.trim()) {
        const val = col.defaultValue.trim();
        const isQuoted = /^['"].*['"]$/.test(val);
        const isNumeric = /^-?\d+(\.\d+)?$/.test(val);
        const isKeyword = /^(CURRENT_TIMESTAMP|NOW\(\)|CURRENT_DATE|NULL|TRUE|FALSE|gen_random_uuid\(\)|newid\(\)|sysdate)$/i.test(val);
        defaultStr = ` DEFAULT ${isQuoted || isNumeric || isKeyword ? val : `'${val.replace(/'/g, "''")}'`}`;
      }

      prompt += `${idx + 1}. Column \`${col.name}\` (${col.dataType})${constraintStr}${defaultStr}\n`;
    });
    prompt += "- Include these column(s) as standard columns in every table and Mermaid entity.\n";
  }

  if (globalRules?.trim()) {
    prompt += `Additional User Rules:\n${globalRules.trim()}\n`;
  }

  prompt += "═════════════════════════════════════════════════════════════════\n";
  return prompt;
}

/**
 * Formats a custom column definition according to the target SQL dialect.
 */
export function formatCustomColumnSQL(col: CustomColumn, dialect: string = "postgresql"): string {
  const d = (dialect || "postgresql").toLowerCase();
  let type = (col.dataType || "VARCHAR(255)").trim();

  // Dialect-specific type adaptations
  if (/^VARCHAR$/i.test(type)) {
    if (d === "oracle") type = "VARCHAR2(255)";
    else if (d === "mssql") type = "NVARCHAR(255)";
    else if (d === "sqlite") type = "TEXT";
    else type = "VARCHAR(255)";
  } else if (/^VARCHAR\(\d+\)$/i.test(type) && d === "oracle") {
    type = type.replace(/^VARCHAR/i, "VARCHAR2");
  } else if (/^TIMESTAMP$/i.test(type)) {
    if (d === "mssql") type = "DATETIME2";
    else if (d === "sqlite") type = "TEXT";
    else if (d === "oracle") type = "TIMESTAMP";
    else type = "TIMESTAMP";
  } else if (/^BOOLEAN$/i.test(type)) {
    if (d === "oracle") type = "NUMBER(1)";
    else if (d === "mssql") type = "BIT";
    else if (d === "sqlite") type = "INTEGER";
    else if (d === "mysql") type = "TINYINT(1)";
  } else if (/^UUID$/i.test(type)) {
    if (d === "mysql" || d === "sqlite") type = "VARCHAR(36)";
    else if (d === "mssql") type = "UNIQUEIDENTIFIER";
    else if (d === "oracle") type = "VARCHAR2(36)";
  }

  const parts = [col.name, type];

  // Constraints
  if (col.constraints?.notNull && !col.constraints?.primaryKey) {
    parts.push("NOT NULL");
  }

  if (col.constraints?.primaryKey) {
    parts.push("PRIMARY KEY");
  } else if (col.constraints?.unique) {
    parts.push("UNIQUE");
  }

  // Default value
  if (col.defaultValue !== undefined && col.defaultValue !== null && col.defaultValue.trim() !== "") {
    const defVal = col.defaultValue.trim();
    const isQuoted = /^['"].*['"]$/.test(defVal);
    const isNumeric = /^-?\d+(\.\d+)?$/.test(defVal);
    const isKeyword = /^(CURRENT_TIMESTAMP|NOW\(\)|CURRENT_DATE|NULL|TRUE|FALSE|gen_random_uuid\(\)|uuid_generate_v4\(\)|newid\(\)|sysdate)$/i.test(defVal);

    if (isQuoted || isNumeric || isKeyword) {
      parts.push(`DEFAULT ${defVal}`);
    } else {
      parts.push(`DEFAULT '${defVal.replace(/'/g, "''")}'`);
    }
  }

  return parts.join(" ");
}

/**
 * Dynamically and reliably applies active custom columns to every CREATE TABLE statement
 * in a SQL script, without duplicating already existing columns.
 */
export function applyCustomColumnsToSQL(
  sql: string,
  columns: CustomColumn[] = [],
  dialect: string = "postgresql"
): string {
  if (!sql || typeof sql !== "string") return sql;
  const active = (columns || []).filter((c) => c && c.enabled);
  if (active.length === 0) return sql;

  const createTableRegex = /CREATE\s+(?:(?:GLOBAL\s+TEMPORARY|TEMPORARY|TEMP)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?\w+[`"\]]?(?:\.[`"\[]?\w+[`"\]]?)?)\s*\(/gi;

  let match: RegExpExecArray | null;
  const tablesToProcess: {
    tableName: string;
    openParenIndex: number;
    closeParenIndex: number;
  }[] = [];

  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableNameRaw = match[1];
    const tableName = tableNameRaw.replace(/[`"\[\]]/g, "").split(".").pop() || tableNameRaw;
    const openParenIndex = match.index + match[0].length - 1;

    let depth = 0;
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inLineComment = false;
    let inBlockComment = false;
    let closeParenIndex = -1;

    for (let i = openParenIndex; i < sql.length; i++) {
      const ch = sql[i];
      const next = sql[i + 1] || "";

      if (inLineComment) {
        if (ch === "\n") inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i++;
        }
        continue;
      }
      if (inSingleQuote) {
        if (ch === "'" && sql[i - 1] !== "\\") {
          if (next === "'") { i++; }
          else { inSingleQuote = false; }
        }
        continue;
      }
      if (inDoubleQuote) {
        if (ch === '"' && sql[i - 1] !== "\\") {
          inDoubleQuote = false;
        }
        continue;
      }

      if (ch === "-" && next === "-") {
        inLineComment = true;
        i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        i++;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = true;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = true;
        continue;
      }

      if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0) {
          closeParenIndex = i;
          break;
        }
      }
    }

    if (closeParenIndex !== -1) {
      tablesToProcess.push({
        tableName,
        openParenIndex,
        closeParenIndex,
      });
    }
  }

  if (tablesToProcess.length === 0) return sql;

  let result = sql;
  const indicesToAdd: { tableName: string; colName: string }[] = [];

  for (let t = tablesToProcess.length - 1; t >= 0; t--) {
    const { tableName, openParenIndex, closeParenIndex } = tablesToProcess[t];
    const body = result.substring(openParenIndex + 1, closeParenIndex);

    const missingCols: CustomColumn[] = [];
    for (const col of active) {
      const colClean = col.name.trim();
      const hasCol = new RegExp(
        `(^|[,\\s])[\`"\\[]?${escapeRegex(colClean)}[\`"\\]]?\\s+([A-Za-z_]|[\`"\\[])`,
        "i"
      ).test(body);

      if (!hasCol) {
        missingCols.push(col);
      }
    }

    if (missingCols.length === 0) continue;

    const indentMatch = body.match(/\n([ \t]+)[^\s]/);
    const indent = indentMatch ? indentMatch[1] : "    ";

    const colDefs = missingCols.map((col) => {
      if (col.constraints?.indexed) {
        indicesToAdd.push({ tableName, colName: col.name });
      }
      return `${indent}${formatCustomColumnSQL(col, dialect)}`;
    });

    const constraintRegex = /\n[ \t]*(CONSTRAINT\s+\w+|PRIMARY\s+KEY\s*\(|FOREIGN\s+KEY\s*\(|UNIQUE\s*\(|KEY\s+\w+|INDEX\s+\w+)/i;
    const constraintMatch = body.match(constraintRegex);

    let newBody = "";
    if (constraintMatch && constraintMatch.index !== undefined) {
      const insertPos = constraintMatch.index;
      const before = body.substring(0, insertPos).trimEnd();
      const after = body.substring(insertPos);
      const needsComma = !before.trimEnd().endsWith(",");
      newBody = `${before}${needsComma ? "," : ""}\n${colDefs.join(",\n")},${after}`;
    } else {
      const trimmedBody = body.trimEnd();
      const needsComma = trimmedBody.length > 0 && !trimmedBody.endsWith(",");
      newBody = `${trimmedBody}${needsComma ? "," : ""}\n${colDefs.join(",\n")}\n`;
    }

    result =
      result.substring(0, openParenIndex + 1) +
      newBody +
      result.substring(closeParenIndex);
  }

  if (indicesToAdd.length > 0) {
    const indexStatements: string[] = [];
    for (const { tableName, colName } of indicesToAdd) {
      const idxName = `idx_${tableName}_${colName}`;
      if (!new RegExp(`\\b${escapeRegex(idxName)}\\b`, "i").test(result)) {
        indexStatements.push(`CREATE INDEX ${idxName} ON ${tableName} (${colName});`);
      }
    }
    if (indexStatements.length > 0) {
      result = `${result.trimEnd()}\n\n-- Custom Column Indexes\n${indexStatements.join("\n")}\n`;
    }
  }

  return result;
}

/**
 * Dynamically applies active custom columns to every entity in a Mermaid diagram,
 * supporting erDiagram and classDiagram formats.
 */
export function applyCustomColumnsToMermaid(
  mermaid: string,
  columns: CustomColumn[] = [],
  diagramType: string = "er"
): string {
  if (!mermaid || typeof mermaid !== "string") return mermaid;
  const active = (columns || []).filter((c) => c && c.enabled);
  if (active.length === 0) return mermaid;

  const dt = (diagramType || "er").toLowerCase();

  const getMermaidType = (dataType: string): string => {
    const t = (dataType || "").toLowerCase();
    if (t.includes("int") || t.includes("serial")) return "int";
    if (t.includes("float") || t.includes("double") || t.includes("decimal") || t.includes("numeric")) return "float";
    if (t.includes("bool")) return "boolean";
    if (t.includes("date") || t.includes("time")) return "datetime";
    return "string";
  };

  if (dt === "er" || mermaid.includes("erDiagram")) {
    const entityRegex = /(^|\n)([ \t]*)([A-Za-z0-9_]+)\s*\{([^}]*)\}/g;

    return mermaid.replace(entityRegex, (match, prefix, indent, entityName, entityBody) => {
      let updatedBody = entityBody;
      const linesToAdd: string[] = [];

      for (const col of active) {
        const colClean = col.name.trim();
        const hasCol = new RegExp(`\\b${escapeRegex(colClean)}\\b`, "i").test(updatedBody);
        if (!hasCol) {
          const mType = getMermaidType(col.dataType);
          let marker = "";
          if (col.constraints?.primaryKey) marker = " PK";
          else if (col.constraints?.unique) marker = " UK";
          linesToAdd.push(`        ${mType} ${colClean}${marker}`);
        }
      }

      if (linesToAdd.length === 0) return match;

      const trimmedBody = updatedBody.trimEnd();
      const bodyWithCols = trimmedBody.length > 0
        ? `${trimmedBody}\n${linesToAdd.join("\n")}\n    `
        : `\n${linesToAdd.join("\n")}\n    `;

      return `${prefix}${indent}${entityName} {${bodyWithCols}}`;
    });
  } else if (dt === "class" || mermaid.includes("classDiagram")) {
    const classRegex = /(^|\n)([ \t]*class\s+([A-Za-z0-9_]+)\s*\{)([^}]*)\}/g;

    return mermaid.replace(classRegex, (match, prefix, header, className, classBody) => {
      const linesToAdd: string[] = [];

      for (const col of active) {
        const colClean = col.name.trim();
        const hasCol = new RegExp(`\\b${escapeRegex(colClean)}\\b`, "i").test(classBody);
        if (!hasCol) {
          const mType = getMermaidType(col.dataType);
          linesToAdd.push(`        +${mType} ${colClean}`);
        }
      }

      if (linesToAdd.length === 0) return match;

      const trimmedBody = classBody.trimEnd();
      const bodyWithCols = trimmedBody.length > 0
        ? `${trimmedBody}\n${linesToAdd.join("\n")}\n    `
        : `\n${linesToAdd.join("\n")}\n    `;

      return `${prefix}${header}${bodyWithCols}}`;
    });
  }

  return mermaid;
}
