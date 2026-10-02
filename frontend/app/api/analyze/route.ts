import { NextRequest, NextResponse } from "next/server";

const MISTRAL_MODEL   = "mistral-tiny";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const REQUEST_TIMEOUT = 120_000;

// ─────────────────────────────────────────────────────────────────────────────
// DIALECT-SPECIFIC DDL RULES
// Each entry overrides only the parts that differ from the shared base.
// ─────────────────────────────────────────────────────────────────────────────
const DIALECT_RULES: Record<string, string> = {

  postgresql: `
━━━ TARGET DIALECT: PostgreSQL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Default column type: VARCHAR(255)
• Primary keys: use column-level PRIMARY KEY keyword (no SERIAL/AUTO_INCREMENT unless annotated)
• Foreign key structure (two-section layout):
    Section 1 — CREATE TABLE … (columns + PK only, NO FK inside CREATE TABLE)
    Section 2 — ALTER TABLE … ADD CONSTRAINT fk_<name> FOREIGN KEY (col) REFERENCES tbl(col);
• Quote reserved words with double-quotes: "Order", "User", etc.
• No IF NOT EXISTS, no ENGINE clause, no schema prefix.
• Output ONLY raw PostgreSQL DDL. No markdown, no prose.`,

  mysql: `
━━━ TARGET DIALECT: MySQL 8 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Default column type: VARCHAR(255)
• Use backtick quoting for reserved words: \`order\`, \`user\`, etc.
• Primary keys: column-level PRIMARY KEY (no AUTO_INCREMENT unless annotated)
• Foreign keys: declare INLINE inside CREATE TABLE using:
    CONSTRAINT fk_<name> FOREIGN KEY (col) REFERENCES tbl(col)
• Add ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci after each closing );
• Use -- for comments.
• Output ONLY raw MySQL DDL. No markdown, no prose.
• Example structure:
    CREATE TABLE \`Customer\` (
      \`Customer_ID\` VARCHAR(255) PRIMARY KEY,
      \`Name\`        VARCHAR(255)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE \`Order\` (
      \`Order_ID\`    VARCHAR(255) PRIMARY KEY,
      \`Customer_ID\` VARCHAR(255),
      CONSTRAINT fk_order_customer FOREIGN KEY (\`Customer_ID\`) REFERENCES \`Customer\`(\`Customer_ID\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

  sqlite: `
━━━ TARGET DIALECT: SQLite 3 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL SQLite rules — every single one must be obeyed:

1. PRAGMA first line (always emit this before any CREATE TABLE):
     PRAGMA foreign_keys = ON;

2. Default column type: TEXT  (NOT VARCHAR — SQLite ignores length limits)
   Allowed types only: TEXT, INTEGER, REAL, BLOB, NUMERIC
   Never use VARCHAR, CHAR, BOOLEAN, DATE, TIMESTAMP, FLOAT, DOUBLE in output.

3. Primary keys:
   • Single-column PK: INTEGER PRIMARY KEY  (this is the rowid alias — fast)
     BUT only use INTEGER PRIMARY KEY when the PK attribute has no explicit type annotation
     and is clearly a surrogate/ID column. If the PK name is a natural key (e.g. a name,
     code or email) keep it as TEXT PRIMARY KEY.
   • Composite PK (weak entity): list columns in table body, then:
       PRIMARY KEY (col1, col2)
     at the end of the column list, before closing parenthesis.

4. Foreign keys: declare INLINE inside CREATE TABLE (SQLite does NOT support ALTER TABLE ADD CONSTRAINT):
     FOREIGN KEY (col) REFERENCES tbl(col)
   Place all FK lines at the END of the column list, after all column definitions.

5. No ALTER TABLE … ADD CONSTRAINT — SQLite does not support it. All FKs must be inside CREATE TABLE.

6. No CONSTRAINT keyword before FOREIGN KEY in SQLite — write:
     FOREIGN KEY (col) REFERENCES tbl(col)   ← correct
   NOT:
     CONSTRAINT fk_name FOREIGN KEY (col) …  ← wrong for SQLite

7. Quote reserved words with double-quotes: "order", "group", "user", etc.

8. No ENGINE, no CHARSET, no COLLATE, no schema prefix.

9. Output structure (PRAGMA first, then tables ordered so referenced tables come before referencing ones):
     PRAGMA foreign_keys = ON;

     CREATE TABLE Teacher (
         Teacher_name TEXT PRIMARY KEY
     );

     CREATE TABLE Courses (
         Course_ID   TEXT PRIMARY KEY,
         Course_name TEXT,
         Teacher_name TEXT,
         FOREIGN KEY (Teacher_name) REFERENCES Teacher(Teacher_name)
     );

10. Output ONLY raw SQLite DDL. No markdown, no prose, no ALTER TABLE statements.`,

  mssql: `
━━━ TARGET DIALECT: Microsoft SQL Server (T-SQL) ━━━━━━━━━━━━━━━━━━
• Default column type: NVARCHAR(255)
• Quote reserved words with square brackets: [order], [user], [name], etc.
• Primary keys: column-level PRIMARY KEY or table-level CONSTRAINT pk_<tbl> PRIMARY KEY (col)
• Foreign key structure (two-section layout):
    Section 1 — CREATE TABLE … (columns + PK only, NO FK inside CREATE TABLE)
    Section 2 — ALTER TABLE [tbl] ADD CONSTRAINT fk_<name> FOREIGN KEY ([col]) REFERENCES [tbl]([col]);
• Add GO after each statement batch if needed, but plain semicolons are acceptable.
• No ENGINE, no CHARSET, no COLLATE clause.
• Use -- for comments.
• Output ONLY raw T-SQL DDL. No markdown, no prose.`,

  oracle: `
━━━ TARGET DIALECT: Oracle Database (SQL*Plus compatible) ━━━━━━━━━
• Default column type: VARCHAR2(255)
• Quote reserved words with double-quotes: "ORDER", "USER", "NAME", etc.
• Primary keys: column-level PRIMARY KEY (no AUTOINCREMENT unless annotated)
• Foreign key structure (two-section layout):
    Section 1 — CREATE TABLE … (columns + PRIMARY KEY constraint only)
    Section 2 — ALTER TABLE tbl ADD CONSTRAINT fk_<name> FOREIGN KEY (col) REFERENCES tbl(col);
• End each statement with a semicolon.
• No ENGINE, no CHARSET, no COLLATE.
• Use -- for comments.
• Output ONLY raw Oracle DDL. No markdown, no prose.`,
};

import { buildCustomColumnsPrompt, applyCustomColumnsToSQL } from "@/lib/customization";
import { CustomColumn } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BASE PROMPT (visual extraction + fidelity rules)
// ─────────────────────────────────────────────────────────────────────────────
function buildPrompt(dialect: string, customPrompt: string = ""): string {
  const dialectRules = DIALECT_RULES[dialect] ?? DIALECT_RULES.postgresql;

  return `You are a DDL generator. Your sole job is to transcribe exactly what is drawn in the ER diagram into valid, executable DDL for the specified target dialect. You must never use outside knowledge to add, infer, rename, or improve anything beyond what is literally visible in the image except as explicitly mandated by User Customization Rules below.

${dialectRules}

${customPrompt}

════════════════════════════════════════════════════════════════════
PHASE 1 — VISUAL EXTRACTION  (internal reasoning only, no output)
════════════════════════════════════════════════════════════════════
Carefully scan every part of the image and build an internal list:

ENTITIES   — every rectangle or box visible → becomes one TABLE
ATTRIBUTES — every oval/ellipse connected by a line to an entity box → becomes one COLUMN on that entity
             • Underlined attribute name → this column is the PRIMARY KEY of its entity
             • Dashed-border oval → derived attribute, SKIP IT ENTIRELY, do not create a column
             • Double-oval or oval filled red → multi-valued attribute → separate junction table
PRIMARY KEYS — collect the exact text of every underlined attribute per entity
RELATIONSHIPS
             • Diamond shape with cardinality labels on its lines → note (entity A) — (cardinality) — (entity B)
             • 1:N → FK column goes into the N-side table
             • M:N → create a junction table <A>_<B> with two FK columns
             • Weak entity (double rectangle) + identifying relationship (double diamond) → composite PK
             • Double line on a relationship line → that FK column is NOT NULL
FK COLUMNS — for every relationship, note which column carries the FK and which table/column it references

If any text is unreadable or ambiguous, flag it UNCERTAIN — see Phase 3.

════════════════════════════════════════════════════════════════════
PHASE 2 — DDL GENERATION RULES  (apply mechanically, zero exceptions)
════════════════════════════════════════════════════════════════════

━━━ DATATYPE RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

T1. DEFAULT TYPE — use the dialect default stated above for every column not covered by T2 or T3.
T2. ANNOTATED TYPE — if and only if the diagram prints an explicit datatype label directly
    next to an attribute name (e.g. "Age : INT"), use that exact type mapped to the target dialect.
T3. FK CARRY-OVER TYPE — a column that exists solely to hold a foreign key value
    must use the same type as the primary key column it references.

━━━ PRIMARY KEY RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

P1. A column is a PRIMARY KEY only if its attribute name is visibly underlined in the diagram.
P2. Follow the dialect PK rules stated above.
P3. For a composite PK (weak entity), follow the dialect composite PK syntax stated above.
P4. Do not add AUTO_INCREMENT or sequences unless explicitly annotated.

━━━ FOREIGN KEY RULES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

F1. Add a FK only when the diagram explicitly draws a relationship line between two entities.
F2. Every FK must reference a table and column that exist in the same output script.
    If a FK would reference a table not drawn in the diagram, omit the FK and add:
    -- WARNING: FK references <TableName> which is not present in this diagram
F3. NOT NULL on a FK column only if the relationship line is drawn as a double line.
F4. Follow the FK placement rules (inline vs ALTER TABLE) stated in the dialect section above.

━━━ DIAGRAM FIDELITY & CUSTOM COLUMNS RULES ━━━━━━━━━━━━━━━━━━━━━━

D1. One TABLE per visible entity box.
D2. Columns: Include all visible attribute ovals connected to that entity.
D3. Copy the EXACT text visible in the diagram for every name. Do not fix spelling,
    change case, expand abbreviations, or pluralise. OCR what you see literally.
D4. User Custom Columns: Include each active configured custom column in EVERY single table generated, regardless of whether it is visible or assigned in the diagram image.

════════════════════════════════════════════════════════════════════
PHASE 3 — UNCERTAIN ELEMENTS
════════════════════════════════════════════════════════════════════
• Unreadable attribute name → use best approximation and add: -- OCR uncertain
• Unreadable entity name    → emit: -- TABLE UNCERTAIN: entity name unreadable
• Ambiguous relationship    → emit: -- RELATIONSHIP UNCERTAIN: describe what you see
• Do not silently skip any element; always surface uncertainty as a SQL comment.

════════════════════════════════════════════════════════════════════
PHASE 4 — FINAL OUTPUT
════════════════════════════════════════════════════════════════════
Output ONLY raw DDL following the structure described in the dialect section above.
No prose. No explanation. No markdown fences. No extra blank lines between statements.
If no ER diagram is visible in the image output exactly: -- No ER diagram detected in image.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json({ error: "Conversion service is not configured" }, { status: 503 });
    }

    const form = await req.formData();
    const file    = form.get("image")   as File   | null;
    const dialect = (form.get("dialect") as string | null)?.toLowerCase() ?? "postgresql";
    const customColsRaw = form.get("customColumns") as string | null;
    const customRulesRaw = form.get("customRules") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PNG, JPG, JPEG, WEBP are supported" },
        { status: 400 }
      );
    }

    let customPrompt = "";
    let parsedCols: CustomColumn[] = [];
    if (customColsRaw || customRulesRaw) {
      try {
        parsedCols = customColsRaw ? JSON.parse(customColsRaw) : [];
        customPrompt = buildCustomColumnsPrompt(parsedCols, customRulesRaw || "");
      } catch (e) {
        console.warn("Failed to parse customColumns in analyze:", e);
      }
    }

    // Convert file to base64
    const bytes    = await file.arrayBuffer();
    const b64      = Buffer.from(bytes).toString("base64");
    const mimeType = file.type === "image/svg+xml" ? "image/png" : file.type;

    const prompt = buildPrompt(dialect, customPrompt);

    const t0   = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);

    const mistralPayload = {
      model: MISTRAL_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 2000,  // Limit tokens to save quota
    };

    const res = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(mistralPayload),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    console.log(`Mistral API response: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`Mistral API error: ${res.status} - ${txt}`);
      return NextResponse.json(
        { error: `Mistral API error ${res.status}: ${txt.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    let sql: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!sql) {
      return NextResponse.json({ error: "Empty response from Mistral" }, { status: 500 });
    }

    if (parsedCols.length > 0) {
      sql = applyCustomColumnsToSQL(sql, parsedCols, dialect);
    }

    return NextResponse.json({
      sql,
      dialect,
      processingTime: Date.now() - t0,
      filename: file.name,
    });

  } catch (err: any) {
    // clearTimeout(timer); // Remove this line - timer not in scope
    
    if (err?.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out (120s)" }, { status: 408 });
    }
    
    // Network connectivity issues
    if (err?.code === "ENOTFOUND" || err?.code === "ECONNREFUSED" || err?.message?.includes("fetch")) {
      console.error("Network error connecting to Mistral API:", err);
      return NextResponse.json({ 
        error: "Network error: Unable to connect to Mistral AI service. Please check your internet connection." 
      }, { status: 503 });
    }
    
    console.error("analyze route error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
