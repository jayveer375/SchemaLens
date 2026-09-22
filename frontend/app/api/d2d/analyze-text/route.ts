import { NextRequest, NextResponse } from "next/server";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "open-mistral-7b";

const DIAGRAM_TYPES = [
  "er", "class", "usecase", "flowchart", "dfd",
  "sequence", "activity", "architecture", "component", "schema",
  "state", "network", "mindmap", "timeline", "process",
];

function buildAnalyzePrompt(text: string): string {
  return "You are a database schema expert. Extract ONLY entities explicitly mentioned in the content.\n\nANALYZE THIS CONTENT:\n" + text.slice(0, 2000) + "\n\nSTRICT EXTRACTION RULES:\n1. ONLY extract nouns/entities directly mentioned in the text\n2. NEVER add generic entities (users, images, content, etc.) unless specifically described\n3. Focus on the PRIMARY domain - ignore peripheral mentions\n4. Every entity needs clear evidence from the original text\n5. If unclear, mark as ambiguous rather than guessing\n\nDOMAIN EXAMPLES:\n- Library Management → User, Book, Loan (NOT: images, ratings, social features)\n- Hospital System → Patient, Doctor, Appointment (NOT: content management)\n- E-commerce Site → Customer, Product, Order (NOT: social media features)\n- School System → Student, Teacher, Course (NOT: generic CMS entities)\n\nReturn ONLY this JSON format:\n{\n  \"domain\": \"specific domain detected\",\n  \"confidence\": \"high|medium|low\",\n  \"is_ambiguous\": false,\n  \"core_entities\": [\n    {\n      \"name\": \"EntityName\",\n      \"evidence\": \"exact quote proving this entity exists\",\n      \"attributes\": [\"domain_specific_field1\", \"domain_specific_field2\"],\n      \"confidence\": \"high|medium|low\"\n    }\n  ],\n  \"relationships\": [\n    {\n      \"from\": \"Entity1\",\n      \"to\": \"Entity2\",\n      \"type\": \"one-to-many|many-to-many|one-to-one\",\n      \"label\": \"relationship_verb\",\n      \"evidence\": \"text proving this relationship\"\n    }\n  ],\n  \"recommended_types\": [\"er\"],\n  \"summary\": \"what this system actually does\"\n}\n\nVALIDATION:\n- If <3 clear entities found, set is_ambiguous=true\n- Each entity needs evidence from original text\n- Attributes must be domain-relevant (not generic id/name/email)\n- Only suggest \"er\" if entities are clear database tables";
}

export async function POST(request: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    const formData = await request.formData();
    const text = (formData.get("text") as string)?.trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > 5000) {
      return NextResponse.json({ error: "Text too long (max 5000 chars)" }, { status: 400 });
    }

    const prompt = buildAnalyzePrompt(text);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);

    let result: any = null;
    let lastError = "";

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 2000));

        const res = await fetch(MISTRAL_API_URL, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + MISTRAL_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 1500,
            temperature: 0.3,
          }),
          signal: ctrl.signal,
        });

        clearTimeout(timer);

        if (res.status === 429) {
          lastError = "Rate limit";
          continue;
        }

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          lastError = err?.error?.message || "HTTP " + res.status;
          continue;
        }

        const raw = await res.json();
        const content = raw.choices?.[0]?.message?.content ?? "";

        // Parse JSON
        try {
          result = JSON.parse(content);
        } catch {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) result = JSON.parse(match[0]);
        }

        if (result) break;
      } catch (e: any) {
        lastError = e.message;
        if (e.name === "AbortError") break;
      }
    }

    // Fallback if Mistral failed
    if (!result) {
      result = {
        domain: "unknown",
        confidence: "low",
        is_ambiguous: true,
        ambiguity_reason: "AI analysis failed - please provide clearer description",
        core_entities: [],
        relationships: [],
        recommended_types: ["flowchart"],
        summary: "Analysis failed",
      };
    }

    // Validate entities have evidence
    const validEntities = (result.core_entities || []).filter((e: any) => 
      e.evidence && e.evidence.length > 10
    );

    // Check if we need clarification
    const needsClarification = result.is_ambiguous || validEntities.length < 2;

    // Convert to legacy format with enhanced validation
    const legacyExtracted = {
      entities: validEntities.map((e: any) => ({
        name: e.name,
        attributes: e.attributes || ["id"],
        type: "entity",
        evidence: e.evidence,
        confidence: e.confidence,
      })),
      relationships: (result.relationships || []).filter((r: any) => 
        r.evidence && validEntities.some((e: any) => e.name === r.from) && validEntities.some((e: any) => e.name === r.to)
      ),
      actors: [],
      processes: [],
      data_flows: [],
      components: [],
      summary: result.summary || "",
      // Validation metadata
      domain: result.domain,
      validation: {
        is_ambiguous: needsClarification,
        ambiguity_reason: result.ambiguity_reason,
        total_entities: validEntities.length,
        entities_with_evidence: validEntities.filter((e: any) => e.evidence).length,
        has_sufficient_data: validEntities.length >= 2,
        needs_clarification: needsClarification
      }
    };

    // Recommend types based on content quality
    let validTypes = (result.recommended_types || []).filter((t: string) =>
      DIAGRAM_TYPES.includes(t)
    );
    
    if (needsClarification) {
      validTypes = ["flowchart"]; // Safer fallback for ambiguous content
    } else if (validEntities.length >= 2) {
      validTypes = validTypes.includes("er") ? validTypes : ["er"].concat(validTypes);
    }
    
    if (validTypes.length === 0) validTypes.push("flowchart");

    return NextResponse.json({
      recommended_types: validTypes,
      confidence: result.confidence || "low",
      reason: needsClarification ? 
        "UNCLEAR INPUT: " + (result.ambiguity_reason || 'Please provide more specific details about entities and their relationships') :
        "Detected " + result.domain + " with " + validEntities.length + " clear entities",
      extracted: legacyExtracted,
    });
  } catch (error: any) {
    console.error("D2D analyze error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}