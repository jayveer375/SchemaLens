import { NextRequest, NextResponse } from "next/server";

const MISTRAL_MODEL   = "mistral-small-latest";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const REQUEST_TIMEOUT = 30_000;

/**
 * Fallback prompt optimizer for schema generation when external AI is unavailable.
 * Expands rough keywords into a comprehensive, relational schema specification.
 */
function fallbackOptimizeGenerate(rawPrompt: string): string {
  const text = rawPrompt.trim();
  // Extract keywords / tokens
  const words = text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["and", "the", "for", "with", "system", "app", "database", "schema", "make", "create", "need"].includes(w.toLowerCase()));

  const uniqueWords = Array.from(new Set(words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())));
  const primaryEntity = uniqueWords[0] || "User";
  const relatedEntities = uniqueWords.slice(1, 6);

  let result = `Design a comprehensive, production-grade relational database schema for: "${text}".\n\n`;
  result += `1. Core Domains & Entities:\n`;
  result += `   - Primary entity: ${primaryEntity} with unique ID (UUID/Serial), standard profile details, status flags, and timestamps.\n`;

  if (relatedEntities.length > 0) {
    relatedEntities.forEach((ent) => {
      result += `   - ${ent}: Includes dedicated identifier, descriptive attributes, audit fields, and operational status.\n`;
    });
  } else {
    result += `   - Transactions / Activity: Tracking user actions, logs, timestamps, and reference identifiers.\n`;
    result += `   - Categories / Metadata: Classifications, tags, and configuration attributes.\n`;
  }

  result += `\n2. Key Relationships & Cardinality:\n`;
  if (relatedEntities.length >= 2) {
    result += `   - One-to-many relationship from ${primaryEntity} to ${relatedEntities[0]} (e.g. one ${primaryEntity} owns or manages multiple ${relatedEntities[0]} records).\n`;
    result += `   - Many-to-many relationship between ${relatedEntities[0]} and ${relatedEntities[1]} via an associative junction table with compound key and audit timestamps.\n`;
  } else if (relatedEntities.length === 1) {
    result += `   - One-to-many relationship from ${primaryEntity} to ${relatedEntities[0]} with foreign key constraints.\n`;
  } else {
    result += `   - Establish strict foreign key references between parent and child tables with ON DELETE CASCADE or RESTRICT where appropriate.\n`;
  }

  result += `\n3. Integrity, Constraints & Audit Trail:\n`;
  result += `   - Enforce primary keys on all tables, NOT NULL on required fields, and UNIQUE constraints on natural identifiers (e.g., email, code, slug).\n`;
  result += `   - Include created_at and updated_at TIMESTAMP columns with DEFAULT CURRENT_TIMESTAMP across all tables.\n`;
  result += `   - Apply snake_case naming conventions consistently across all table and column names.`;

  return result;
}

/**
 * Fallback prompt optimizer for Quick Convert conversion instructions.
 */
function fallbackOptimizeQuickConvert(rawPrompt: string): string {
  const text = rawPrompt.trim();
  const lower = text.toLowerCase();

  const rules: string[] = [];

  // Naming rules
  rules.push("1. Enforce strict snake_case naming conventions for all tables and column names, avoiding reserved SQL keywords.");

  // Primary keys
  if (lower.includes("uuid")) {
    rules.push("2. Primary Keys: Use UUID v4 default random identifiers (e.g., gen_random_uuid()) for all primary keys and corresponding foreign keys.");
  } else {
    rules.push("2. Primary Keys: Ensure each table has an explicit, singular primary key (e.g., id or <table_name>_id) with proper auto-increment or serial behavior.");
  }

  // Foreign keys
  rules.push("3. Foreign Keys: Explicitly define all referential integrity constraints with ON DELETE CASCADE for dependent records and ON DELETE RESTRICT for core lookup data.");

  // Timestamps / Audit
  if (lower.includes("audit") || lower.includes("time") || lower.includes("date") || lower.includes("stamp")) {
    rules.push("4. Audit Trail: Automatically inject `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL and `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL on every table.");
  } else {
    rules.push("4. Metadata: Standardize audit columns (`created_at` and `updated_at` TIMESTAMP) across all generated entity tables.");
  }

  // Soft delete
  if (lower.includes("soft") || lower.includes("delete")) {
    rules.push("5. Soft Deletion: Include `is_deleted` BOOLEAN DEFAULT FALSE NOT NULL and `deleted_at` TIMESTAMP NULL for safe record archiving.");
  }

  // Custom user context
  if (text && text.length > 5) {
    rules.push(`6. Specific Directives: Apply user intent: "${text.replace(/"/g, "'")}" accurately throughout table DDL definition.`);
  }

  return rules.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const context = body.context === "quick-convert" ? "quick-convert" : "generate";

    if (!rawPrompt) {
      return NextResponse.json(
        { error: "Please enter a prompt or keywords to optimize." },
        { status: 400 }
      );
    }

    if (rawPrompt.length > 3000) {
      return NextResponse.json(
        { error: "Prompt is too long (maximum 3000 characters)." },
        { status: 400 }
      );
    }

    // If Mistral API key is not configured or dummy, return fallback immediately
    if (!MISTRAL_API_KEY || MISTRAL_API_KEY.includes("your_mistral_api_key")) {
      const optimized =
        context === "quick-convert"
          ? fallbackOptimizeQuickConvert(rawPrompt)
          : fallbackOptimizeGenerate(rawPrompt);
      return NextResponse.json({
        optimized,
        provider: "local-optimizer",
      });
    }

    // Build system & user prompts for Mistral
    let systemPrompt = "";
    if (context === "quick-convert") {
      systemPrompt = `You are an expert SQL engineer and database prompt optimizer.
Your task is to take a user's rough or brief instructions/notes for converting an ER diagram image into SQL DDL, and optimize them into clear, precise, authoritative schema rules.

Follow these strict guidelines:
1. Primary & Foreign Keys: Explicitly define key types (e.g. UUID v4 or AUTO_INCREMENT/SERIAL) and foreign key behaviors (e.g. ON DELETE CASCADE / RESTRICT).
2. Audit & Tracking: Include standard metadata columns (e.g., created_at, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
3. Naming Conventions: Enforce strict naming rules (e.g., snake_case for tables and columns, plural table names, descriptive constraint names like fk_<table>_<ref>).
4. Data Integrity: Specify NOT NULL constraints, unique indexes, and sensible default values.
5. Format: Output ONLY the optimized instruction points directly as numbered guidelines. Do not include conversational greetings ("Here are your rules:") or markdown explanations.`;
    } else {
      systemPrompt = `You are an expert database architect and schema prompt engineer.
Your task is to take the user's rough, brief, or draft database idea and expand it into a comprehensive, professional, crystal-clear prompt suitable for automated ER diagram and SQL schema generation.

Follow these strict guidelines:
1. Core Entities: Identify and clearly name all main entities (e.g., Users, Products, Orders, Categories).
2. Key Attributes: For each entity, specify essential attributes including primary keys (IDs), descriptive fields, status fields, and audit timestamps.
3. Relationships & Cardinality: Explicitly describe how entities connect with precise business logic (e.g., "A User can place multiple Orders (1-to-many); each Order contains multiple Line Items with Products (many-to-many via OrderItem)").
4. Constraints & Rules: Specify constraints like unique email addresses, non-null requirements, foreign key cascades, and status values.
5. Tone: Write directly as an imperative schema specification in clear, descriptive English paragraphs.
6. Format: Output ONLY the enhanced prompt text directly. Do not include markdown code fences, conversational greetings ("Here is your prompt:"), or sign-offs.`;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);

    try {
      const res = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MISTRAL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Optimize and expand this rough prompt:\n\n"${rawPrompt}"` },
          ],
          temperature: 0.4,
          max_tokens: 1000,
        }),
        signal: ctrl.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`Mistral optimize API error: ${res.status}, falling back to local optimizer`);
        const fallback =
          context === "quick-convert"
            ? fallbackOptimizeQuickConvert(rawPrompt)
            : fallbackOptimizeGenerate(rawPrompt);
        return NextResponse.json({ optimized: fallback, provider: "fallback" });
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content?.trim();

      if (!content) {
        const fallback =
          context === "quick-convert"
            ? fallbackOptimizeQuickConvert(rawPrompt)
            : fallbackOptimizeGenerate(rawPrompt);
        return NextResponse.json({ optimized: fallback, provider: "fallback" });
      }

      // Clean any accidental markdown code fences or wrapper quotes
      const cleaned = content.replace(/^```[\w]*\n?/m, "").replace(/\n?```$/m, "").trim();

      return NextResponse.json({
        optimized: cleaned,
        provider: "mistral",
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      console.warn("Mistral fetch error during prompt optimization:", fetchErr);
      const fallback =
        context === "quick-convert"
          ? fallbackOptimizeQuickConvert(rawPrompt)
          : fallbackOptimizeGenerate(rawPrompt);
      return NextResponse.json({ optimized: fallback, provider: "fallback" });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to optimize prompt" },
      { status: 500 }
    );
  }
}
