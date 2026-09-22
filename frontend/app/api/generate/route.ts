import { NextRequest, NextResponse } from "next/server";
import { buildCustomColumnsPrompt } from "@/lib/customization";
import { CustomColumn } from "@/lib/types";

const MISTRAL_MODEL   = "open-mistral-7b";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const REQUEST_TIMEOUT = 120_000;

// ─────────────────────────────────────────────────────────────────────────────
// DIALECT SQL RULES
// ─────────────────────────────────────────────────────────────────────────────
const DIALECT_RULES: Record<string, string> = {
  postgresql: `TARGET DIALECT: PostgreSQL
- Default column type: VARCHAR(255)
- PK: column-level PRIMARY KEY (no SERIAL unless annotated)
- FK layout: Section 1 = CREATE TABLE (no FKs), Section 2 = ALTER TABLE … ADD CONSTRAINT fk_<name> FOREIGN KEY
- Quote reserved words with double-quotes
- No ENGINE, no CHARSET`,

  mysql: `TARGET DIALECT: MySQL 8
- Default column type: VARCHAR(255)
- Backtick quoting for reserved words
- FK: INLINE inside CREATE TABLE using CONSTRAINT fk_<name> FOREIGN KEY
- Add ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci after each );`,

  sqlite: `TARGET DIALECT: SQLite 3
- First line: PRAGMA foreign_keys = ON;
- Default column type: TEXT (never VARCHAR)
- FK: INLINE inside CREATE TABLE, no CONSTRAINT keyword, no ALTER TABLE ADD CONSTRAINT
- Quote reserved words with double-quotes`,

  mssql: `TARGET DIALECT: Microsoft SQL Server (T-SQL)
- Default column type: NVARCHAR(255)
- Square-bracket quoting for reserved words
- FK layout: Section 1 = CREATE TABLE, Section 2 = ALTER TABLE … ADD CONSTRAINT`,

  oracle: `TARGET DIALECT: Oracle Database
- Default column type: VARCHAR2(255)
- Double-quote reserved words
- FK layout: Section 1 = CREATE TABLE, Section 2 = ALTER TABLE … ADD CONSTRAINT`,
};

// ─────────────────────────────────────────────────────────────────────────────
// DIAGRAM TYPE PROMPTS
// ─────────────────────────────────────────────────────────────────────────────
function buildPrompt(dialect: string, diagramType: string, customPrompt: string = ""): string {
  const rules = DIALECT_RULES[dialect] ?? DIALECT_RULES.postgresql;

  // ── ER Diagram (default) ──────────────────────────────────────────────────
  if (diagramType === "er") {
    return `You are an expert database architect. The user will describe a database in plain English.
Produce TWO outputs:
1. A Mermaid erDiagram
2. Executable ${dialect.toUpperCase()} DDL SQL

════ DIALECT RULES ════
${rules}

${customPrompt}

════ OUTPUT FORMAT — return ONLY valid JSON, no markdown, no prose ════
{
  "mermaid": "<full mermaid erDiagram block>",
  "sql": "<full DDL SQL>",
  "tables": ["table1"],
  "relationships": [{"from":"A","to":"B","type":"one-to-many","label":"has"}]
}

════ MERMAID STRICT RULES — follow exactly or the diagram will not render ════

RULE 1 — First line must be exactly: erDiagram
  No capitalisation variants. No prefix. Just: erDiagram

RULE 2 — Entity attribute format: TYPE name MARKER
  Each attribute is on its own line inside curly braces:
    ENTITY_NAME {
        TYPE column_name MARKER
    }
  MARKER is optional and must be only PK, FK, or UK (nothing else).
  Never combine markers: write PK on one line, not "PK FK".

RULE 3 — ALLOWED attribute types ONLY (never use anything else):
  string, int, float, boolean, date, datetime
  NEVER use: VARCHAR, NVARCHAR, VARCHAR2, TEXT, BIGINT, SERIAL, DECIMAL, TIMESTAMP,
  CHAR, NUMBER, DATETIME2, TINYINT, SMALLINT, INTEGER, NUMERIC, REAL, DOUBLE

RULE 4 — Relationship syntax (exactly):
  ENTITY_A RELATIONSHIP ENTITY_B : "label"
  Where RELATIONSHIP is one of: ||--|| ||--o| ||--|{ ||--o{ }o--|| }o--o{ }|--|| }|--|{
  Labels must be a SINGLE word with NO spaces: use "places" not "places orders"
  NEVER use multi-word labels like "included in" — write "includes" instead

RULE 5 — Entity names: PascalCase or UPPER_SNAKE, no spaces, no hyphens

RULE 6 — No comments (-- lines) inside the mermaid block

VALID EXAMPLE:
erDiagram
    CUSTOMER {
        int customer_id PK
        string first_name
        string email UK
        string phone
    }
    ORDER {
        int order_id PK
        int customer_id FK
        float total
        date created_at
    }
    CUSTOMER ||--o{ ORDER : "places"

════ SQL RULES ════
- Infer sensible PKs, FKs, and cardinalities
- Add realistic columns (name, email, created_at etc.)
- Follow dialect rules strictly`;
  }

  // ── Flowchart ─────────────────────────────────────────────────────────────
  if (diagramType === "flowchart") {
    return `You are a software architect. The user describes a system or process.
Produce TWO outputs:
1. A Mermaid flowchart (top-down)
2. The ${dialect.toUpperCase()} database schema that supports this system

════ DIALECT RULES ════
${rules}

════ OUTPUT FORMAT — return ONLY valid JSON, no markdown, no prose ════
{
  "mermaid": "<full mermaid flowchart block>",
  "sql": "<full DDL SQL>",
  "tables": ["table1"],
  "relationships": []
}

════ CRITICAL MERMAID FLOWCHART RULES ════
- Start EXACTLY with: flowchart TD
- Node IDs must be simple alphanumeric, no spaces, no colons e.g. A, B, step1, regForm
- Node LABELS go in brackets: A[Label Text] for rectangles, A{Label?} for decisions, A([Label]) for rounded
- NEVER use colons inside node IDs or labels
- Arrows MUST use --> not → not ==> not —>
- Labeled arrows: A -->|Yes| B  or  A -->|No| C
- Keep node labels short (max 4 words)
- Max 15 nodes for readability
- Show happy path and at least one alternate path

VALID example:
flowchart TD
  start([Start]) --> reg[Registration Form]
  reg --> valid{Valid?}
  valid -->|Yes| enroll[Enroll Student]
  valid -->|No| reject[Reject Registration]
  enroll --> confirm[Send Confirmation]
  confirm --> done([End])
  reject --> done

════ SQL RULES ════
- Generate the supporting database tables for the described system
- Follow dialect rules strictly`;
  }

  // ── DFD Level 0 (Context Diagram) ────────────────────────────────────────
  if (diagramType === "dfd0") {
    return `You are a systems analyst. The user describes a system.
Produce TWO outputs:
1. A Mermaid flowchart representing a DFD Level 0 (Context Diagram)
2. The ${dialect.toUpperCase()} database schema for the system

════ DIALECT RULES ════
${rules}

════ OUTPUT FORMAT — return ONLY valid JSON, no markdown, no prose ════
{
  "mermaid": "<full mermaid flowchart block>",
  "sql": "<full DDL SQL>",
  "tables": ["table1"],
  "relationships": []
}

════ CRITICAL MERMAID DFD0 RULES ════
- Start EXACTLY with: flowchart LR
- Node IDs: simple alphanumeric only, NO spaces, NO colons e.g. sys, customer, bank
- Central process node (the system): sys((SystemName))
- External entities: rectangles e.g. customer[Customer]
- Arrows MUST use --> not → not ==>
- Labeled arrows: A -->|"data flow"| B  — keep labels short (2-3 words max)
- Show 2-5 external entities flowing data to/from the central process
- This is a CONTEXT diagram — no internal processes, no data stores

VALID example:
flowchart LR
  customer[Customer] -->|Order Request| sys((OrderSystem))
  sys -->|Confirmation| customer
  sys -->|Payment Request| bank[Bank]
  bank -->|Approval| sys

════ SQL RULES ════
- Generate the supporting database tables
- Follow dialect rules strictly`;
  }

  // ── DFD Level 1 ───────────────────────────────────────────────────────────
  if (diagramType === "dfd1") {
    return `You are a systems analyst. The user describes a system.
Produce TWO outputs:
1. A Mermaid flowchart representing a DFD Level 1
2. The ${dialect.toUpperCase()} database schema for the system

════ DIALECT RULES ════
${rules}

════ OUTPUT FORMAT — return ONLY valid JSON, no markdown, no prose ════
{
  "mermaid": "<full mermaid flowchart block>",
  "sql": "<full DDL SQL>",
  "tables": ["table1"],
  "relationships": []
}

════ CRITICAL MERMAID DFD1 RULES ════
- Start EXACTLY with: flowchart TD
- Node IDs: simple alphanumeric only, NO spaces, NO colons
- External entities: rectangles e.g. user[User]
- Processes: rounded rectangles e.g. p1([Validate Input])
- Data stores: cylinder shape e.g. ds1[(UserDB)]
- Arrows MUST use --> not → not ==>
- Labeled arrows: A -->|"data label"| B  — keep labels short
- Show 3-5 processes, 1-3 data stores, 2-3 external entities
- Max ~20 nodes total

VALID example:
flowchart TD
  user[User] -->|Login Request| p1([Validate Credentials])
  p1 -->|Query| ds1[(UserDB)]
  ds1 -->|User Record| p1
  p1 -->|Valid| p2([Create Session])
  p1 -->|Invalid| p3([Send Error])
  p2 -->|Session Data| ds2[(SessionDB)]
  p2 -->|Token| user
  p3 -->|Error Msg| user

════ SQL RULES ════
- Generate the supporting database tables for all data stores shown
- Follow dialect rules strictly`;
  }

  // ── Class Diagram ─────────────────────────────────────────────────────────
  if (diagramType === "class") {
    return `You are a software architect. The user describes a system or application.
Produce TWO outputs:
1. A Mermaid classDiagram
2. The ${dialect.toUpperCase()} database schema that maps to these classes

════ DIALECT RULES ════
${rules}

════ OUTPUT FORMAT — return ONLY valid JSON, no markdown, no prose ════
{
  "mermaid": "<full mermaid classDiagram block>",
  "sql": "<full DDL SQL>",
  "tables": ["table1"],
  "relationships": []
}

════ CLASS DIAGRAM RULES ════
- Start with: classDiagram
- Each class block:
    class ClassName {
        +type fieldName
        +returnType methodName()
    }
- Use + public, - private, # protected
- Relationship syntax:
    A --|> B  (inheritance)
    A --* B  (composition)
    A --o B  (aggregation)
    A --> B  (association)
    A ..> B  (dependency)
- Add a quoted label on relationships where helpful: A --> B : "label"

════ SQL RULES ════
- Map each class to a table with appropriate columns
- Follow dialect rules strictly`;
  }

  // fallback — ER
  return buildPrompt(dialect, "er");
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json({ error: "Generation service is not configured" }, { status: 503 });
    }

    const body = await req.json();
    const description: string  = (body.description  ?? "").trim();
    const dialect: string      = (body.dialect       ?? "postgresql").toLowerCase();
    const diagramType: string  = (body.diagramType   ?? "er").toLowerCase();
    const customColumns: CustomColumn[] = body.customColumns ?? [];
    const customRules: string  = body.customRules ?? "";

    if (!description) {
      return NextResponse.json({ error: "No description provided" }, { status: 400 });
    }
    if (description.length > 2000) {
      return NextResponse.json({ error: "Description too long (max 2000 characters)" }, { status: 400 });
    }

    const customPrompt = buildCustomColumnsPrompt(customColumns, customRules);
    const prompt = buildPrompt(dialect, diagramType, customPrompt);

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    const t0    = Date.now();

    // Retry logic for rate limits
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          // Wait before retry: 1s, 3s, 9s
          const delay = Math.pow(3, attempt) * 1000;
          console.log(`Retrying in ${delay}ms (attempt ${attempt + 1}/3)`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const res = await fetch(MISTRAL_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MISTRAL_MODEL,
            messages: [{ role: "user", content: `${prompt}\n\nUser description: ${description}` }],
            response_format: { type: "json_object" },
            max_tokens: 1500,  // Reduce tokens to save quota
          }),
          signal: ctrl.signal,
        });

        if (res.status === 429) {
          // Rate limited - try again
          const errorText = await res.text();
          lastError = `Rate limit exceeded (attempt ${attempt + 1})`;
          console.log(`Rate limited on attempt ${attempt + 1}, retrying...`);
          continue;
        }

        clearTimeout(timer);

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          return NextResponse.json(
            { error: `Mistral API error ${res.status}: ${txt.slice(0, 200)}` },
            { status: res.status }
          );
        }

        // Success! Process the response
        const data = await res.json();
        const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

        if (!raw) {
          return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });
        }

        let parsed: { mermaid: string; sql: string; tables: string[]; relationships: unknown[] };
        try {
          parsed = JSON.parse(raw);
        } catch {
          const match = raw.match(/\{[\s\S]*\}/);
          if (!match) return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
          parsed = JSON.parse(match[0]);
        }

        if (!parsed.mermaid || !parsed.sql) {
          return NextResponse.json({ error: "AI response missing required fields" }, { status: 500 });
        }

        return NextResponse.json({
          mermaid: parsed.mermaid,
          sql: parsed.sql,
          tables: parsed.tables ?? [],
          relationships: parsed.relationships ?? [],
          dialect,
          diagramType,
          processingTime: Date.now() - t0,
        });

      } catch (fetchError: any) {
        lastError = fetchError.message;
        if (attempt === 2) break; // Last attempt
        console.log(`Fetch error on attempt ${attempt + 1}:`, fetchError.message);
      }
    }

    // All retries failed - provide local fallback
    clearTimeout(timer);
    
    // Generate a basic fallback response
    const fallbackMermaid = `erDiagram
    USER {
        int user_id PK
        string username
        string email
        string created_at
    }
    PROFILE {
        int profile_id PK
        int user_id FK
        string first_name
        string last_name
    }
    USER ||--|| PROFILE : "has"`;

    const fallbackSQL = `-- Generated offline due to API limits
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE profiles (
    profile_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    first_name VARCHAR(255),
    last_name VARCHAR(255)
);`;

    return NextResponse.json({
      mermaid: fallbackMermaid,
      sql: fallbackSQL,
      tables: ["users", "profiles"],
      relationships: [{"from":"users","to":"profiles","type":"one-to-one","label":"has"}],
      dialect,
      diagramType,
      processingTime: Date.now() - t0,
      warning: "Generated using fallback due to API rate limits. This is a generic template - please modify as needed."
    });

  } catch (err: any) {
    if (err?.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out (120s)" }, { status: 408 });
    }
    console.error("generate route error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
