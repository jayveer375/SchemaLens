import { NextRequest, NextResponse } from "next/server";

const MISTRAL_MODEL   = "mistral-small-latest";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const REQUEST_TIMEOUT = 120_000;

// ─────────────────────────────────────────────────────────────────────────────
// Per-dialect syntax reference injected into the prompt
// ─────────────────────────────────────────────────────────────────────────────
const DIALECT_SYNTAX: Record<string, string> = {
  postgresql: `
TARGET: PostgreSQL
- Quoting: double-quotes for reserved words → "order", "user"
- Auto-increment: SERIAL or GENERATED ALWAYS AS IDENTITY
- Booleans: BOOLEAN / TRUE / FALSE
- String concat: || operator or CONCAT()
- Limit/offset: LIMIT n OFFSET m
- Date/time: NOW(), CURRENT_TIMESTAMP, DATE_TRUNC()
- JSON: JSONB, JSON types supported
- Procedures: CREATE OR REPLACE FUNCTION / PROCEDURE ... LANGUAGE plpgsql
- Triggers: CREATE OR REPLACE TRIGGER ... EXECUTE FUNCTION
- Top-N: LIMIT n
- IF NOT EXISTS supported on CREATE TABLE, INDEX
- FK: ALTER TABLE … ADD CONSTRAINT fk_name FOREIGN KEY`,

  mysql: `
TARGET: MySQL 8
- Quoting: backticks → \`order\`, \`user\`
- Auto-increment: AUTO_INCREMENT on INT column
- Booleans: TINYINT(1), use 1/0 instead of TRUE/FALSE
- String concat: CONCAT() function (no || operator)
- Limit/offset: LIMIT n OFFSET m  or  LIMIT m,n
- Date/time: NOW(), SYSDATE(), DATE_FORMAT()
- Procedures: DELIMITER $$ ... CREATE PROCEDURE ... BEGIN...END$$ DELIMITER ;
- Triggers: CREATE TRIGGER ... BEFORE/AFTER INSERT/UPDATE/DELETE ON tbl FOR EACH ROW
- Top-N: LIMIT n
- Table options: ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci after each CREATE TABLE
- FK: CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES tbl(col) inside CREATE TABLE`,

  sqlite: `
TARGET: SQLite 3
- First line of output: PRAGMA foreign_keys = ON;
- Quoting: double-quotes for reserved words
- Auto-increment: INTEGER PRIMARY KEY (rowid alias) — never AUTOINCREMENT keyword unless needed
- Booleans: INTEGER (1=true, 0=false) — no BOOLEAN type
- Types allowed: TEXT, INTEGER, REAL, BLOB, NUMERIC only — never VARCHAR, CHAR, BOOLEAN, DATE, TIMESTAMP
- String concat: || operator
- Limit/offset: LIMIT n OFFSET m
- Date/time: datetime('now'), strftime()
- No CREATE PROCEDURE, no CREATE FUNCTION, no stored procedures — comment them out with: -- SQLite does not support stored procedures
- Triggers: CREATE TRIGGER supported, but no DELIMITER needed
- FK: FOREIGN KEY (col) REFERENCES tbl(col) inline inside CREATE TABLE — NO ALTER TABLE ADD CONSTRAINT
- No ALTER TABLE ADD COLUMN TYPE changes — SQLite has limited ALTER TABLE support`,

  mssql: `
TARGET: Microsoft SQL Server (T-SQL)
- Quoting: square brackets → [order], [user]
- Auto-increment: IDENTITY(1,1) on INT column
- Booleans: BIT, use 1/0
- Default string type: NVARCHAR(n) instead of VARCHAR
- String concat: + operator or CONCAT()
- Limit/offset: SELECT TOP n ... or OFFSET m ROWS FETCH NEXT n ROWS ONLY (requires ORDER BY)
- Date/time: GETDATE(), SYSDATETIME(), FORMAT()
- Procedures: CREATE OR ALTER PROCEDURE ... AS BEGIN...END
- Triggers: CREATE OR ALTER TRIGGER ... ON tbl AFTER INSERT,UPDATE,DELETE AS BEGIN...END
- FK: ALTER TABLE tbl ADD CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES tbl(col)
- No LIMIT keyword — use TOP or OFFSET/FETCH`,

  oracle: `
TARGET: Oracle Database (SQL*Plus compatible)
- Quoting: double-quotes → "ORDER", "USER"
- Auto-increment: CREATE SEQUENCE seq_name START WITH 1 INCREMENT BY 1; then use seq_name.NEXTVAL in INSERT, or GENERATED ALWAYS AS IDENTITY (Oracle 12c+)
- Booleans: no BOOLEAN in SQL — use NUMBER(1) with 0/1, or VARCHAR2(1) with 'Y'/'N'
- Default string type: VARCHAR2(n)
- String concat: || operator or CONCAT()
- Limit/offset: FETCH FIRST n ROWS ONLY (Oracle 12c+) or ROWNUM <= n (older)
- Date/time: SYSDATE, SYSTIMESTAMP, TO_DATE(), TO_CHAR()
- Procedures: CREATE OR REPLACE PROCEDURE ... AS BEGIN...END; /
- Triggers: CREATE OR REPLACE TRIGGER ... BEFORE/AFTER INSERT OR UPDATE OR DELETE ON tbl FOR EACH ROW BEGIN...END; /
- FK: ALTER TABLE tbl ADD CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES tbl(col)
- Each statement ends with semicolon; each procedure/trigger ends with /
- No LIMIT keyword`,
};

import { buildCustomColumnsPrompt } from "@/lib/customization";
import { CustomColumn } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder
// ─────────────────────────────────────────────────────────────────────────────
function buildMigratePrompt(source: string, target: string, customPrompt: string = ""): string {
  const targetRules = DIALECT_SYNTAX[target] ?? DIALECT_SYNTAX.postgresql;

  return `You are an expert SQL migration specialist. Your job is to convert SQL scripts from one database dialect to another with 100% accuracy.

SOURCE DIALECT: ${source.toUpperCase()}
${DIALECT_SYNTAX[source] ?? ""}

${targetRules}

${customPrompt}

════════════════════════════════════════════════════════════════
MIGRATION RULES — follow every rule without exception
════════════════════════════════════════════════════════════════

STATEMENT COVERAGE — convert ALL of the following:
1. CREATE TABLE — adjust data types, quoting, constraints, ENGINE clause
2. ALTER TABLE — ADD COLUMN, DROP COLUMN, ADD CONSTRAINT, MODIFY COLUMN
3. DROP TABLE / DROP INDEX / DROP VIEW
4. INSERT INTO — adjust quoting, boolean values, date literals
5. UPDATE / DELETE
6. SELECT — adjust LIMIT/TOP/ROWNUM, date functions, string functions
7. CREATE INDEX / UNIQUE INDEX
8. CREATE VIEW / CREATE OR REPLACE VIEW
9. Stored Procedures — adapt BEGIN/END syntax, DELIMITER, language blocks
10. Functions — adapt RETURNS clause, body syntax
11. Triggers — adapt DELIMITER, FOR EACH ROW, trigger body syntax
12. Sequences — CREATE SEQUENCE / SERIAL / AUTO_INCREMENT / IDENTITY conversions
13. Comments — preserve all -- and /* */ comments
14. Transaction blocks — BEGIN/COMMIT/ROLLBACK

DATA TYPE MAPPING (apply systematically):
- INT/INTEGER: stays INT in MySQL/MSSQL, NUMBER in Oracle, INTEGER in SQLite/PG
- VARCHAR(n): stays VARCHAR in PG/MySQL/MSSQL, VARCHAR2 in Oracle, TEXT in SQLite
- TEXT: LONGTEXT in MySQL, CLOB in Oracle, TEXT in PG/SQLite, NVARCHAR(MAX) in MSSQL
- BOOLEAN: BOOLEAN in PG, TINYINT(1) in MySQL, BIT in MSSQL, NUMBER(1) in Oracle, INTEGER in SQLite
- DATETIME/TIMESTAMP: TIMESTAMP in PG/MySQL, DATETIME2 in MSSQL, TIMESTAMP/DATE in Oracle, TEXT in SQLite
- SERIAL/AUTO_INCREMENT/IDENTITY: convert to equivalent in target dialect
- FLOAT/DOUBLE: FLOAT8/DOUBLE PRECISION in PG, FLOAT in MySQL/MSSQL, FLOAT in Oracle, REAL in SQLite
- DECIMAL(p,s)/NUMERIC(p,s): keep in PG/MySQL/MSSQL, NUMBER(p,s) in Oracle, NUMERIC in SQLite

FUNCTION MAPPING (convert all occurrences):
- NOW() / GETDATE() / SYSDATE → target equivalent
- ISNULL() → COALESCE() in PG, IFNULL() in MySQL, NVL() in Oracle
- SUBSTRING() → SUBSTR() in Oracle, SUBSTRING() elsewhere
- LEN() → LENGTH() in PG/MySQL/Oracle/SQLite
- TOP n → LIMIT n or FETCH FIRST n ROWS ONLY
- CONCAT(a,b) → a||b in PG/SQLite/Oracle, CONCAT() in MySQL/MSSQL
- CHARINDEX() → INSTR() in Oracle/MySQL, POSITION() in PG
- GETDATE() → NOW() in PG/MySQL, SYSDATE in Oracle, datetime('now') in SQLite

UNSUPPORTED FEATURES:
- If target does not support a feature (e.g. stored procedures in SQLite), add a comment explaining why and skip gracefully:
  -- [TARGET_DIALECT] does not support stored procedures — skipped
- Never silently drop statements

OUTPUT FORMAT:
- Output ONLY the converted SQL — no explanation, no markdown, no prose
- Preserve original statement order
- Add a single-line comment before each major section if there are multiple types:
  -- === TABLES ===
  -- === PROCEDURES ===
  -- === TRIGGERS ===
- Preserve all original comments from the source script

Now convert the following SQL script:`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json({ error: "Migration service is not configured" }, { status: 503 });
    }

    const body = await req.json();
    const sql: string    = (body.sql ?? "").trim();
    const source: string = (body.source ?? "").toLowerCase();
    const target: string = (body.target ?? "").toLowerCase();
    const customColumns: CustomColumn[] = body.customColumns ?? [];
    const customRules: string  = body.customRules ?? "";

    if (!sql)    return NextResponse.json({ error: "No SQL script provided" }, { status: 400 });
    if (!source) return NextResponse.json({ error: "Source dialect required" }, { status: 400 });
    if (!target) return NextResponse.json({ error: "Target dialect required" }, { status: 400 });
    if (source === target) return NextResponse.json({ error: "Source and target dialects must be different" }, { status: 400 });
    if (sql.length > 50_000) return NextResponse.json({ error: "Script too large (max 50,000 characters)" }, { status: 400 });

    const customPrompt = buildCustomColumnsPrompt(customColumns, customRules);
    const prompt = buildMigratePrompt(source, target, customPrompt);

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    const t0    = Date.now();

    const res = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [
          { role: "user", content: `${prompt}\n\n${sql}` },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Mistral API error ${res.status}: ${txt.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const converted: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!converted) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });
    }

    // Strip accidental markdown fences if model adds them
    const clean = converted
      .replace(/^```[\w]*\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    return NextResponse.json({
      sql: clean,
      source,
      target,
      processingTime: Date.now() - t0,
      originalLines: sql.split("\n").length,
      convertedLines: clean.split("\n").length,
    });

  } catch (err: any) {
    if (err?.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out (120s)" }, { status: 408 });
    }
    console.error("migrate route error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
