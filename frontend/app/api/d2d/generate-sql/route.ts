import { NextRequest, NextResponse } from "next/server";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "open-mistral-7b";

const DIALECT_RULES: Record<string, string> = {
  postgresql: `-- PostgreSQL
-- Primary keys: SERIAL PRIMARY KEY
-- Foreign keys: ALTER TABLE t ADD CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES other(col);
-- Timestamps: TIMESTAMPTZ DEFAULT NOW()
-- Text: VARCHAR(255) default`,

  mysql: `-- MySQL 8
-- Primary keys: INT AUTO_INCREMENT PRIMARY KEY
-- Foreign keys: CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES other(col) inside CREATE TABLE
-- End every table: ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Backtick identifiers`,

  sqlite: `-- SQLite 3
-- First line: PRAGMA foreign_keys = ON;
-- Primary keys: INTEGER PRIMARY KEY AUTOINCREMENT
-- Foreign keys: REFERENCES other(col) inline, no ALTER TABLE
-- Types: TEXT, INTEGER, REAL, BLOB only`,

  mssql: `-- SQL Server T-SQL
-- Primary keys: INT IDENTITY(1,1) PRIMARY KEY
-- Foreign keys: ALTER TABLE t ADD CONSTRAINT fk_name FOREIGN KEY (col) REFERENCES other(col);
-- Brackets for identifiers: [table_name]
-- Timestamps: DATETIME2 DEFAULT GETDATE()`,
};

function buildPrompt(description: string, extracted: any, dialect: string, diagramType: string): string {
  const rules = DIALECT_RULES[dialect] ?? DIALECT_RULES.postgresql;

  // Use validated entities only
  const validEntities = (extracted?.entities || []).filter((e: any) => 
    e.evidence && e.confidence !== "low"
  ).slice(0, 8);

  const validRelationships = (extracted?.relationships || []).filter((r: any) => 
    r.evidence && validEntities.some((e: any) => e.name === r.from) && validEntities.some((e: any) => e.name === r.to)
  ).slice(0, 8);

  // Check if we have sufficient validated data
  if (validEntities.length < 2) {
    return `Generate minimal ${dialect.toUpperCase()} SQL for: ${description.slice(0, 800)}
    
Since specific entities are unclear, create a basic 3-table structure based on common patterns for this domain.
Use realistic domain-appropriate table and column names.
Output ONLY raw SQL — no markdown, no explanation.`;
  }

  const entityList = validEntities.map((e: any) => 
    `  - ${e.name}: ${e.attributes?.slice(0, 4).join(", ") || "id, basic fields"} (Evidence: "${e.evidence?.slice(0, 40) || ""}...")`
  ).join("\n");

  const relList = validRelationships.map((r: any) => 
    `  - ${r.from} → ${r.to} (${r.type}) - ${r.evidence?.slice(0, 30) || ""}...`
  ).join("\n");

  const domain = extracted?.domain || "generic";
  const validation = extracted?.validation || {};

  return `Generate complete, accurate ${dialect.toUpperCase()} SQL DDL for this ${domain} system.

${rules}

SYSTEM DESCRIPTION:
${description.slice(0, 1000)}

VALIDATED ENTITIES (with evidence from description):
${entityList}

VALIDATED RELATIONSHIPS:
${relList}

VALIDATION STATUS:
- Domain: ${domain}
- Entities with evidence: ${validEntities.length}
- High confidence entities: ${validEntities.filter((e: any) => e.confidence === "high").length}
- Ambiguous: ${validation.is_ambiguous ? "YES - be conservative" : "NO"}

GENERATION RULES:
1. Generate CREATE TABLE for EACH validated entity only
2. Use domain-specific column names (library: isbn, title, due_date | hospital: diagnosis, appointment_time)
3. Every table needs PRIMARY KEY appropriate for ${dialect}
4. Add FOREIGN KEY constraints for validated relationships only
5. Include domain-appropriate columns based on evidence
6. Add created_at/updated_at to main entities
7. Output ONLY executable SQL — no markdown, no comments except table descriptions
8. If entities insufficient, create minimal realistic schema for the domain

Generate the ${dialect.toUpperCase()} DDL:`;
}

async function callMistral(prompt: string): Promise<string> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 90_000);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 2000));
      const res = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${MISTRAL_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 3000,
          temperature: 0.1,
        }),
        signal: ctrl.signal,
      });
      if (res.status === 429 && attempt < 2) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } catch (e: any) {
      if (e.name === "AbortError" || attempt === 2) throw e;
    }
  }
  throw new Error("Mistral failed");
}

function cleanSQL(raw: string): string {
  return raw
    .replace(/^```sql\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```\s*$/i, "")
    .replace(/^Here (is|are).*\n/im, "").replace(/^The following.*\n/im, "")
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
    const diagramType: string = (body.diagram_type ?? "er").toLowerCase();
    const extracted: any      = body.extracted || {};

    if (!description && !extracted?.entities?.length) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }

    if (!DIALECT_RULES[dialect]) {
      return NextResponse.json({ error: "Invalid dialect" }, { status: 400 });
    }

    const prompt = buildPrompt(description, extracted, dialect, diagramType);
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
