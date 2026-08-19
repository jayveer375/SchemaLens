// Robust SQL parser — handles nested parens, ALTER TABLE FK, and inline REFERENCES

export interface Column {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isCompositePK: boolean;
  isCompositeFK: boolean;
  references?: {
    table: string;
    column: string;
  };
}

export interface Table {
  name: string;
  columns: Column[];
}

export interface Relationship {
  id: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  cardinality: "1:1" | "1:N" | "N:1" | "N:M";
  label: string;
}

export interface Schema {
  tables: Table[];
  relationships: Relationship[];
}

// ── Extract the body of a CREATE TABLE — balanced parentheses ────────────────
function extractTableBody(sql: string, startIdx: number): string {
  let depth = 0;
  let start = -1;
  for (let i = startIdx; i < sql.length; i++) {
    if (sql[i] === "(") {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (sql[i] === ")") {
      depth--;
      if (depth === 0 && start !== -1) {
        return sql.slice(start, i);
      }
    }
  }
  return "";
}

// ── Split column defs respecting nested parens (e.g. VARCHAR(255)) ───────────
function splitColumnDefs(body: string): string[] {
  const defs: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "," && depth === 0) {
      defs.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) defs.push(current.trim());
  return defs;
}

export function parseSQLSchema(sql: string): Schema {
  const tables: Table[] = [];
  const relationships: Relationship[] = [];

  // Normalize: remove comments, collapse whitespace
  const normalized = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();

  // ── 1. Find all CREATE TABLE positions ────────────────────────────────────
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?\s*\(/gi;
  let m: RegExpExecArray | null;

  while ((m = createRe.exec(normalized)) !== null) {
    const tableName = m[1];
    const openParenIdx = normalized.indexOf("(", m.index + m[0].length - 1);
    const tableBody = extractTableBody(normalized, openParenIdx);

    const columns: Column[] = [];
    const primaryKeys: string[] = [];
    const foreignKeys: Map<string, { table: string; column: string }> = new Map();

    // First pass — pick up table-level PRIMARY KEY constraints
    const pkRe = /PRIMARY\s+KEY\s*\(([^)]+)\)/gi;
    let pkm: RegExpExecArray | null;
    while ((pkm = pkRe.exec(tableBody)) !== null) {
      pkm[1].split(",").forEach((c) =>
        primaryKeys.push(c.trim().replace(/["'`]/g, ""))
      );
    }

    // Second pass — pick up table-level FOREIGN KEY constraints
    const fkRe =
      /(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(["'`]?(\w+)["'`]?\)\s+REFERENCES\s+["'`]?(\w+)["'`]?\s*(?:\(["'`]?(\w+)["'`]?\))?/gi;
    let fkm: RegExpExecArray | null;
    while ((fkm = fkRe.exec(tableBody)) !== null) {
      foreignKeys.set(fkm[1], { table: fkm[2], column: fkm[3] || fkm[1] });
    }

    // Third pass — parse individual column definitions
    const defs = splitColumnDefs(tableBody);
    for (const def of defs) {
      const upper = def.toUpperCase().trimStart();
      // Skip constraint lines
      if (
        upper.startsWith("CONSTRAINT") ||
        upper.startsWith("PRIMARY KEY") ||
        upper.startsWith("FOREIGN KEY") ||
        upper.startsWith("UNIQUE") ||
        upper.startsWith("CHECK") ||
        upper.startsWith("INDEX") ||
        upper.startsWith("KEY ")
      ) continue;

      // Match: colName  datatype(...)  [modifiers]
      const colMatch = def.match(
        /^["'`]?(\w+)["'`]?\s+([A-Za-z_]\w*(?:\s*\([^)]*\))?(?:\s+(?:UNSIGNED|ZEROFILL|BINARY|ASCII|UNICODE|VARYING))*)/i
      );
      if (!colMatch) continue;

      const colName = colMatch[1];
      const colType = colMatch[2].trim();

      const isPK =
        /PRIMARY\s+KEY/i.test(def) || primaryKeys.includes(colName);

      // Inline REFERENCES
      const inlineFkMatch = def.match(
        /REFERENCES\s+["'`]?(\w+)["'`]?\s*(?:\(["'`]?(\w+)["'`]?\))?/i
      );
      if (inlineFkMatch) {
        foreignKeys.set(colName, {
          table: inlineFkMatch[1],
          column: inlineFkMatch[2] || colName,
        });
      }

      columns.push({
        name: colName,
        type: colType,
        isPrimaryKey: isPK,
        isForeignKey: foreignKeys.has(colName) || !!inlineFkMatch,
        isCompositePK: primaryKeys.length > 1 && primaryKeys.includes(colName),
        isCompositeFK: false,
      });
    }

    // Mark composite FKs
    if (foreignKeys.size > 1) {
      columns.forEach((c) => {
        if (c.isForeignKey) c.isCompositeFK = true;
      });
    }

    // Attach FK references to columns
    foreignKeys.forEach((ref, fromCol) => {
      const col = columns.find((c) => c.name === fromCol);
      if (col) {
        col.isForeignKey = true;
        col.references = ref;
      }
    });

    if (columns.length > 0) {
      tables.push({ name: tableName, columns });
    }

    // Build relationships from this table's FK map
    foreignKeys.forEach((ref, fromColumn) => {
      relationships.push({
        id: `${tableName}__${fromColumn}__${ref.table}__${ref.column}`,
        fromTable: tableName,
        fromColumn,
        toTable: ref.table,
        toColumn: ref.column,
        cardinality: "1:N",
        label: `${fromColumn} → ${ref.column}`,
      });
    });
  }

  // ── 2. Handle ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY ─────────────────
  const alterFkRe =
    /ALTER\s+TABLE\s+["'`]?(\w+)["'`]?\s+ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(["'`]?(\w+)["'`]?\)\s+REFERENCES\s+["'`]?(\w+)["'`]?\s*(?:\(["'`]?(\w+)["'`]?\))?/gi;
  let am: RegExpExecArray | null;
  while ((am = alterFkRe.exec(normalized)) !== null) {
    const fromTable = am[1];
    const fromColumn = am[2];
    const toTable = am[3];
    const toColumn = am[4] || fromColumn;

    // Mark the column on its table as FK
    const tbl = tables.find((t) => t.name === fromTable);
    if (tbl) {
      const col = tbl.columns.find((c) => c.name === fromColumn);
      if (col) {
        col.isForeignKey = true;
        col.references = { table: toTable, column: toColumn };
      }
    }

    // Add relationship (deduplicate)
    const relId = `${fromTable}__${fromColumn}__${toTable}__${toColumn}`;
    if (!relationships.find((r) => r.id === relId)) {
      relationships.push({
        id: relId,
        fromTable,
        fromColumn,
        toTable,
        toColumn,
        cardinality: "1:N",
        label: `${fromColumn} → ${toColumn}`,
      });
    }
  }

  return { tables, relationships };
}

export function validateSQL(sql: string): { valid: boolean; error?: string } {
  if (!sql || sql.trim().length === 0) {
    return { valid: false, error: "SQL is empty" };
  }
  const count = (sql.match(/CREATE\s+TABLE/gi) || []).length;
  if (count === 0) {
    return { valid: false, error: "No CREATE TABLE statements found" };
  }
  return { valid: true };
}

export function generateMermaidFromSchema(
  schema: Schema,
  diagramType: "er" | "flowchart" | "dfd0" | "dfd1" | "class" = "er"
): string {
  if (diagramType === "er") {
    const lines: string[] = ["erDiagram"];
    for (const rel of schema.relationships) {
      const fromT = rel.fromTable.replace(/[^a-zA-Z0-9_]/g, "_");
      const toT = rel.toTable.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${toT} ||--o{ ${fromT} : "has"`);
    }
    for (const table of schema.tables) {
      const tName = table.name.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${tName} {`);
      for (const col of table.columns) {
        let type = "string";
        const t = (col.type || "").toLowerCase();
        if (t.includes("int") || t.includes("serial")) type = "int";
        else if (t.includes("float") || t.includes("double") || t.includes("decimal") || t.includes("numeric")) type = "float";
        else if (t.includes("bool")) type = "boolean";
        else if (t.includes("date") || t.includes("time")) type = "datetime";

        let pkfk = "";
        if (col.isPrimaryKey) pkfk = " PK";
        else if (col.isForeignKey) pkfk = " FK";
        const cName = col.name.replace(/[^a-zA-Z0-9_]/g, "_");
        lines.push(`        ${type} ${cName}${pkfk}`);
      }
      lines.push(`    }`);
    }
    return lines.join("\n");
  } else if (diagramType === "class") {
    const lines: string[] = ["classDiagram"];
    for (const table of schema.tables) {
      const tName = table.name.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    class ${tName} {`);
      for (const col of table.columns) {
        const cName = col.name.replace(/[^a-zA-Z0-9_]/g, "_");
        lines.push(`        +string ${cName}`);
      }
      lines.push(`    }`);
    }
    for (const rel of schema.relationships) {
      const fromT = rel.fromTable.replace(/[^a-zA-Z0-9_]/g, "_");
      const toT = rel.toTable.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${toT} <|-- ${fromT}`);
    }
    return lines.join("\n");
  } else {
    // flowchart / dfd
    const lines: string[] = ["flowchart TD"];
    for (const table of schema.tables) {
      const tName = table.name.replace(/[^a-zA-Z0-9_]/g, "_");
      const colSummary = table.columns.slice(0, 4).map((c) => c.name).join(", ");
      lines.push(`    ${tName}["${table.name}${colSummary ? ` (${colSummary})` : ""}"]`);
    }
    for (const rel of schema.relationships) {
      const fromT = rel.fromTable.replace(/[^a-zA-Z0-9_]/g, "_");
      const toT = rel.toTable.replace(/[^a-zA-Z0-9_]/g, "_");
      const safeLabel = (rel.fromColumn || "rel").replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`    ${toT} -->|${safeLabel}| ${fromT}`);
    }
    return lines.join("\n");
  }
}

