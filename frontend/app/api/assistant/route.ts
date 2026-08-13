import { NextRequest, NextResponse } from "next/server";

const MISTRAL_MODEL   = "mistral-small-latest";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const REQUEST_TIMEOUT = 90_000;

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builders
// ─────────────────────────────────────────────────────────────────────────────

function explainPrompt(sql: string): string {
  return `You are a senior database engineer. Explain the following SQL query in plain, simple language that a non-technical stakeholder could understand.

Rules:
- Start with a one-sentence summary of what the query does overall.
- Break down each major clause (SELECT, FROM, JOIN, WHERE, GROUP BY, ORDER BY, etc.) in 1-2 sentences.
- Use bullet points for each clause.
- If the query is invalid or empty, say so clearly.
- Do NOT output any SQL. Output plain text only.
- Keep the total response under 300 words.

SQL query:
\`\`\`sql
${sql}
\`\`\``;
}

function generatePrompt(request: string, schema: string): string {
  const schemaSection = schema.trim()
    ? `Current database schema (use this to infer table and column names):\n\`\`\`sql\n${schema.slice(0, 8000)}\n\`\`\``
    : "No schema provided — generate reasonable SQL based on the request alone.";
  return `You are a senior SQL developer. Generate a single executable SQL query based on the user's plain-English request.

${schemaSection}

Rules:
- Output ONLY the raw SQL query. No markdown fences, no explanation, no prose.
- Use table and column names exactly as they appear in the schema above.
- Do not use dangerous statements: no DROP, no TRUNCATE, no DELETE without WHERE, no ALTER, no CREATE, no INSERT unless explicitly requested.
- If the request is ambiguous, output a best-effort SELECT with a leading comment explaining the assumption.
- Output one query only.

User request: ${request}`;
}

function analyzePrompt(schema: string): string {
  return `You are a database architect performing a design review. Analyze the following SQL schema and identify design issues.

Schema:
\`\`\`sql
${schema.slice(0, 10000)}
\`\`\`

Return ONLY a JSON array. Each element must have exactly these fields:
- "level": one of "good", "warning", "issue"
- "title": short title (max 8 words)
- "detail": 1-2 sentence explanation

Check for: tables missing a PRIMARY KEY, columns that look like FKs but have no FOREIGN KEY constraint, good UNIQUE constraint candidates, normalization concerns, broken or missing relationships, and well-designed aspects.

Output ONLY the JSON array, no prose, no markdown.`;
}

function chatPrompt(question: string, schema: string, schemaContext: string): string {
  const schemaBlock = schema.trim()
    ? `DATABASE SCHEMA (raw DDL):
\`\`\`sql
${schema.slice(0, 8000)}
\`\`\`

PARSED SCHEMA SUMMARY:
${schemaContext.slice(0, 3000)}`
    : "No schema is currently loaded. Tell the user they need to load a schema first.";

  return `You are an expert database assistant embedded in a schema design tool called ER AI Studio.

${schemaBlock}

RULES:
- Answer only database-related questions.
- If SQL would help, include it after a line that reads exactly "SQL:" followed by the raw SQL on the next line.
- Keep answers concise — 150–400 words max.
- If the user asks something dangerous (DROP, delete all data, etc.), decline politely.
- If no schema is loaded and the question requires schema, say: "Please load or create a database schema first."
- Do NOT expose passwords, API keys, or connection strings.
- Format multi-point answers with short bullet points.

User question: ${question}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.MISTRAL_API_KEY || MISTRAL_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI service is not configured (missing MISTRAL_API_KEY)" }, { status: 503 });
    }

    const body = await req.json();
    const mode: string          = (body.mode          ?? "").trim();
    const input: string         = (body.input         ?? "").trim();
    const schema: string        = (body.schema        ?? "").trim();
    const schemaContext: string = (body.schemaContext  ?? "").trim();

    if (!mode) return NextResponse.json({ error: "mode is required" }, { status: 400 });

    let prompt = "";
    if (mode === "explain") {
      if (!input) return NextResponse.json({ error: "SQL input is required for explain mode" }, { status: 400 });
      if (input.length > 5000) return NextResponse.json({ error: "SQL too long (max 5000 chars)" }, { status: 400 });
      prompt = explainPrompt(input);
    } else if (mode === "generate") {
      if (!input) return NextResponse.json({ error: "Request description is required" }, { status: 400 });
      if (input.length > 1000) return NextResponse.json({ error: "Request too long (max 1000 chars)" }, { status: 400 });
      prompt = generatePrompt(input, schema);
    } else if (mode === "analyze") {
      if (!schema) return NextResponse.json({ error: "Schema is required for analyze mode" }, { status: 400 });
      prompt = analyzePrompt(schema);
    } else if (mode === "chat") {
      if (!input) return NextResponse.json({ error: "Question is required" }, { status: 400 });
      if (input.length > 2000) return NextResponse.json({ error: "Question too long (max 2000 chars)" }, { status: 400 });
      prompt = chatPrompt(input, schema, schemaContext);
    } else {
      return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
    }

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
    const t0    = Date.now();

    const res = await fetch(MISTRAL_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [{ role: "user", content: prompt }],
        ...(mode === "analyze" ? { response_format: { type: "json_object" } } : {}),
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
    const raw: string = data?.choices?.[0]?.message?.content?.trim() ?? "";

    if (!raw) return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });

    if (mode === "explain") {
      return NextResponse.json({ explanation: raw, processingTime: Date.now() - t0 });
    }

    if (mode === "generate") {
      const sql = raw.replace(/^```[\w]*\n?/m, "").replace(/\n?```$/m, "").trim();
      return NextResponse.json({ sql, processingTime: Date.now() - t0 });
    }

    if (mode === "analyze") {
      let findings: unknown[] = [];
      try {
        const parsed = JSON.parse(raw);
        findings = Array.isArray(parsed) ? parsed : (parsed.findings ?? parsed.results ?? Object.values(parsed)[0] ?? []);
      } catch {
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) { try { findings = JSON.parse(match[0]); } catch { /* ignore */ } }
      }
      return NextResponse.json({ findings, processingTime: Date.now() - t0 });
    }

    if (mode === "chat") {
      return NextResponse.json({ answer: raw, processingTime: Date.now() - t0 });
    }

    return NextResponse.json({ error: "Unhandled mode" }, { status: 500 });

  } catch (err: unknown) {
    if ((err as { name?: string })?.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out (90s)" }, { status: 408 });
    }
    console.error("assistant route error:", err);
    return NextResponse.json({ error: (err as Error)?.message ?? "Unknown error" }, { status: 500 });
  }
}
