import { NextRequest, NextResponse } from "next/server";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "open-mistral-7b";

const SYSTEM_PROMPT = `You are a SQL expert. Generate complete, accurate DDL SQL for the given schema.
Output ONLY raw SQL statements — no markdown fences, no explanation, no extra text before or after.`;

const DIALECT_SYNTAX: Record<string, string> = {
  postgresql: `PRIMARY KEY syntax: id SERIAL PRIMARY KEY
FOREIGN KEY syntax: ALTER TABLE child ADD CONSTRAINT fk_name FOREIGN KEY (col_id) REFERENCES parent(id);
Timestamps: TIMESTAMPTZ DEFAULT NOW()
String: VARCHAR(255)`,
  mysql: `PRIMARY KEY syntax: id INT AUTO_INCREMENT PRIMARY KEY
FOREIGN KEY syntax: inside CREATE TABLE: CONSTRAINT fk_name FOREIGN KEY (col_id) REFERENCES parent(id)
Timestamps: DATETIME DEFAULT CURRENT_TIMESTAMP
End each table: ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  sqlite: `PRIMARY KEY syntax: id INTEGER PRIMARY KEY AUTOINCREMENT
FOREIGN KEY syntax: col_id INTEGER REFERENCES parent(id)  -- inline, no ALTER TABLE
Add at top: PRAGMA foreign_keys = ON;
Types: TEXT, INTEGER, REAL, BLOB only`,
  mssql: `PRIMARY KEY syntax: id INT IDENTITY(1,1) PRIMARY KEY
FOREIGN KEY syntax: ALTER TABLE child ADD CONSTRAINT fk_name FOREIGN KEY (col_id) REFERENCES parent(id);
Timestamps: DATETIME2 DEFAULT GETDATE()
Identifiers: [table_name], [column_name]`,
};

function buildUserPrompt(description: string, extracted: any, dialect: string): string {
  const entities: any[] = (extracted?.entities || []).slice(0, 12);
  const relationships: any[] = (extracted?.relationships || []).slice(0, 12);
  const domain: string = extracted?.domain || "system";
  const syntax = DIALECT_SYNTAX[dialect] ?? DIALECT_SYNTAX.postgresql;

  // Build entity list with their attributes
  const entityLines = entities.map((e: any) => {
    const attrs = (e.attributes || ["id"]).join(", ");
    return `  - ${e.name}(${attrs})`;
  }).join("\n");

  // Build relationship list
  const relLines = relationships.map((r: any) =>
    `  - ${r.from} ${r.type || "one-to-many"} ${r.to}`
  ).join("\n");

  return `Generate ${dialect.toUpperCase()} DDL SQL for a ${domain} system.

SYSTEM DESCRIPTION:
${description.slice(0, 1200)}

ENTITIES TO CREATE:
${entityLines || "  (derive from description above)"}

RELATIONSHIPS:
${relLines || "  (derive from description above)"}

${dialect.toUpperCase()} SYNTAX RULES:
${syntax}

COLUMN NAMING — use domain-specific names:
- Library: isbn, title, author, publisher, genre, due_date, return_date, fine_amount, membership_no, member_since
- Hospital: patient_id, diagnosis, prescription, ward_no, appointment_time, treatment, discharge_date, doctor_id
- E-commerce: sku, price, stock_qty, category, order_total, payment_status, shipping_address, delivery_date
- School: student_code, course_code, credits, grade, gpa, semester, enrollment_date, graduation_year
- HR: employee_code, department, designation, salary, hire_date, manager_id, leave_balance
- Restaurant: table_no, cuisine_type, menu_item, price, order_time, delivery_time, rating
- Banking: account_no, balance, transaction_type, branch_code, ifsc_code, interest_rate

REQUIREMENTS:
1. One CREATE TABLE per entity
2. Use the exact column names from ENTITIES list above
3. Every table has a primary key
4. Add FOREIGN KEY for every relationship
5. Add created_at timestamp to every table
6. No NULL values unless it makes domain sense

Output only the SQL, starting with the first CREATE TABLE:`;
}

async function callMistral(prompt: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));
      const res = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          max_tokens: 3000,
          temperature: 0.1,
        }),
      });
      if (res.status === 429 && attempt < 2) { await new Promise(r => setTimeout(r, 8000)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } catch (e: any) {
      if (attempt === 2) throw e;
    }
  }
  throw new Error("Mistral failed");
}

function cleanSQL(raw: string): string {
  return raw
    .replace(/^```sql\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^(Here is|Here's|The following|Below is|This generates|Sure)[^\n]*\n/im, "")
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    const body = await request.json();
    const dialect: string     = (body.dialect ?? "postgresql").toLowerCase();
    const description: string = (body.description ?? body.text ?? "").slice(0, 1500);
    const extracted: any      = body.extracted || {};

    if (!description && !extracted?.entities?.length) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    const validDialects = ["postgresql", "mysql", "sqlite", "mssql"];
    if (!validDialects.includes(dialect)) {
      return NextResponse.json({ error: "Invalid dialect" }, { status: 400 });
    }

    const prompt = buildUserPrompt(description, extracted, dialect);
    const t0 = Date.now();

    let raw = "";
    try {
      raw = await callMistral(prompt);
    } catch (e: any) {
      return NextResponse.json({ error: `AI generation failed: ${e.message}` }, { status: 500 });
    }

    const sql = cleanSQL(raw);
    if (!sql || sql.length < 30) {
      return NextResponse.json({ error: "AI returned empty SQL" }, { status: 500 });
    }

    return NextResponse.json({ sql, dialect, processing_time_ms: Date.now() - t0 });
  } catch (error: any) {
    console.error("D2D generate-sql error:", error);
    return NextResponse.json({ error: "SQL generation failed" }, { status: 500 });
  }
}
