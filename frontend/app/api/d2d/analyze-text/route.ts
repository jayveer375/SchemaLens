import { NextRequest, NextResponse } from "next/server";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "open-mistral-7b";

const SYSTEM_PROMPT = `You are a database schema expert. When given a system description, you extract entities (tables), their fields, and relationships.
Always respond with ONLY a valid JSON object — no markdown, no explanation, no extra text.`;

function buildUserPrompt(text: string): string {
  return `Extract the database schema from this description.

DESCRIPTION:
${text.slice(0, 2500)}

Respond with this JSON structure:
{
  "domain": "e.g. Library Management",
  "entities": [
    { "name": "Book", "attributes": ["id", "title", "author", "isbn", "published_year", "available"] },
    { "name": "Member", "attributes": ["id", "name", "email", "phone", "membership_date"] },
    { "name": "Loan", "attributes": ["id", "book_id", "member_id", "borrowed_date", "due_date", "returned_date", "status"] }
  ],
  "relationships": [
    { "from": "Member", "to": "Loan", "type": "one-to-many", "label": "makes" },
    { "from": "Book", "to": "Loan", "type": "one-to-many", "label": "has" }
  ],
  "recommended_types": ["er"]
}

Rules:
- entity names must be PascalCase table names
- attributes must be snake_case column names specific to the domain
- every entity needs an "id" field
- foreign key fields must end in "_id"
- recommended_types: "er" for databases, "flowchart" for processes, "class" for OOP, "dfd" for data flows`;
}

export async function POST(request: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    const formData = await request.formData();
    const text = (formData.get("text") as string)?.trim();

    if (!text) return NextResponse.json({ error: "text is required" }, { status: 400 });
    if (text.length > 5000) return NextResponse.json({ error: "Text too long (max 5000 chars)" }, { status: 400 });

    let result: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));

        const res = await fetch(MISTRAL_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: buildUserPrompt(text) },
            ],
            response_format: { type: "json_object" },
            max_tokens: 2000,
            temperature: 0.1,
          }),
        });

        if (res.status === 429) { await new Promise(r => setTimeout(r, 8000)); continue; }
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }

        const raw = await res.json();
        const content = raw.choices?.[0]?.message?.content ?? "";

        try { result = JSON.parse(content); } catch {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) result = JSON.parse(match[0]);
        }

        if (result?.entities?.length >= 1) break;
      } catch (e: any) {
        if (attempt === 2) throw e;
      }
    }

    if (!result?.entities?.length) {
      result = { domain: "Generic System", entities: [], relationships: [], recommended_types: ["flowchart"] };
    }

    const entities = (result.entities || []).slice(0, 12).map((e: any) => ({
      name: e.name,
      attributes: Array.isArray(e.attributes) ? e.attributes : ["id"],
      confidence: "high",
      evidence: e.name,
    }));

    const entityNames = new Set(entities.map((e: any) => e.name));
    const relationships = (result.relationships || []).slice(0, 12).filter((r: any) =>
      entityNames.has(r.from) && entityNames.has(r.to)
    );

    const validTypes = ["er", "class", "flowchart", "dfd", "sequence", "usecase", "architecture", "component", "state", "mindmap", "timeline", "network"];
    const recommended_types = (result.recommended_types || ["er"]).filter((t: string) => validTypes.includes(t));
    if (!recommended_types.length) recommended_types.push("er");

    return NextResponse.json({
      recommended_types,
      confidence: "high",
      reason: `Detected ${result.domain} with ${entities.length} entities`,
      extracted: {
        domain: result.domain,
        entities,
        relationships,
        actors: [],
        processes: [],
        data_flows: [],
        components: [],
        summary: result.domain,
        validation: { is_ambiguous: entities.length < 2, has_sufficient_data: entities.length >= 2 },
      },
    });
  } catch (error: any) {
    console.error("D2D analyze error:", error);
    return NextResponse.json({ error: "Analysis failed: " + error.message }, { status: 500 });
  }
}
