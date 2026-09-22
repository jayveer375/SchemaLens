import { NextRequest, NextResponse } from "next/server";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY ?? "";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
const MODEL = "open-mistral-7b";

// ── Mermaid prompt builders per diagram type ───────────────────────────────

function buildPrompt(type: string, extracted: any, originalText: string): string {
  const ctx = `
ORIGINAL DESCRIPTION:
${originalText.slice(0, 800)}

EXTRACTED ENTITIES: ${JSON.stringify(extracted.entities?.slice(0, 8) || [])}
EXTRACTED RELATIONSHIPS: ${JSON.stringify(extracted.relationships?.slice(0, 8) || [])}
EXTRACTED ACTORS: ${JSON.stringify(extracted.actors?.slice(0, 6) || [])}
EXTRACTED PROCESSES: ${JSON.stringify(extracted.processes?.slice(0, 6) || [])}
EXTRACTED COMPONENTS: ${JSON.stringify(extracted.components?.slice(0, 6) || [])}
EXTRACTED DATA FLOWS: ${JSON.stringify(extracted.data_flows?.slice(0, 6) || [])}
`.trim();

  const base = `You are an expert diagram architect. Generate a complete, working Mermaid diagram.
Return ONLY the raw Mermaid code — no markdown fences, no explanation, no extra text.
Make it detailed and realistic based on the content below.

${ctx}

`;

  switch (type) {
    case "er":
    case "schema":
      return base + `Generate a Mermaid erDiagram using ONLY the validated entities from extraction.

CRITICAL VALIDATION RULES:
1. ONLY use entities from EXTRACTED_ENTITIES that have evidence
2. REJECT the request if fewer than 2 valid entities exist  
3. NEVER invent entities not in the extraction
4. Every FK must reference an existing PK from another extracted entity
5. Use domain-appropriate attributes based on the evidence

ENTITY VALIDATION PROCESS:
- Check each extracted entity has "evidence" field with real text
- Only include entities with confidence "high" or "medium"
- Ensure entity names match the specific domain context
- Validate all relationships reference actual extracted entities

ATTRIBUTE RULES:
- Use domain-specific attributes based on evidence, not generic ones
- Library: isbn, title, author, due_date, membership_id
- Hospital: patient_id, diagnosis, appointment_time, medical_record_id  
- E-commerce: product_sku, order_total, customer_email, payment_status
- School: student_id, course_code, grade, enrollment_date

VALIDATION EXAMPLE:
If extracted entities are: [{"name":"Book","evidence":"library books","confidence":"high"}, {"name":"User","evidence":"library members","confidence":"high"}]
Then generate Book and User tables with library-specific fields.

If extracted entities are insufficient or lack evidence: 
Return: "VALIDATION_ERROR: Insufficient entity data. Need at least 2 entities with clear evidence from input text."

MERMAID FORMAT (only if validation passes):
erDiagram
    BOOK {
        int id PK  
        string isbn
        string title
        string author
        boolean available
    }
    USER {
        int id PK
        string membership_id
        string name
        string email  
        date membership_date
    }
    LOAN {
        int id PK
        int book_id FK
        int user_id FK
        date borrowed_date
        date due_date
        string status
    }
    USER ||--o{ LOAN : "makes"
    BOOK ||--o{ LOAN : "involved_in"`;

    case "class":
      return base + `Generate a Mermaid classDiagram using ONLY validated entities.

DOMAIN-AWARE VALIDATION:
- Only include classes that correspond to extracted entities with evidence
- Use domain-specific methods (library: borrowBook(), hospital: scheduleAppointment())
- Validate relationships match extracted entity relationships

VALIDATION CHECK:
If fewer than 2 entities with evidence exist:
Return: "VALIDATION_ERROR: Need clear entity descriptions to generate accurate class diagram."

EXAMPLE (only if entities validated):
classDiagram
    class Book {
        +string isbn
        +string title
        +boolean isAvailable
        +reserve() Reservation
        +checkOut(userId) Loan
    }
    class User {
        +string membershipId
        +borrowBook(isbn) Loan
        +returnBook(loanId) boolean
    }
    Book "1" --> "*" Loan : "loaned_as"
    User "1" --> "*" Loan : "borrows"`;

    case "usecase":
      return base + `Generate a Mermaid use case diagram using graph TD.
RULES:
- Use ((Actor)) for actors
- Use [Use Case] for use cases
- Use --> with labels for relationships
- Group related use cases

EXAMPLE:
graph TD
    Customer((Customer))
    Admin((Admin))
    UC1[Register Account]
    UC2[Login]
    UC3[Browse Products]
    UC4[Place Order]
    UC5[Manage Users]
    Customer --> UC1
    Customer --> UC2
    Customer --> UC3
    Customer --> UC4
    Admin --> UC2
    Admin --> UC5`;

    case "flowchart":
    case "process":
      return base + `Generate a detailed Mermaid flowchart with decisions and branches.
RULES:
- First line: flowchart TD
- Start/End: ([Label])
- Process: [Label]
- Decision: {Label}
- Use --> for flow, -->|Yes| and -->|No| for decisions
- Include at least 6 nodes with at least 1 decision diamond

EXAMPLE:
flowchart TD
    Start([Start]) --> Input[Enter Data]
    Input --> Validate{Valid?}
    Validate -->|Yes| Process[Process Data]
    Validate -->|No| Error[Show Error]
    Error --> Input
    Process --> Save[Save to DB]
    Save --> End([End])`;

    case "dfd":
      return base + `Generate a Mermaid Data Flow Diagram using graph LR.
RULES:
- External entities: [Name]
- Processes: ([Name])
- Data stores: [(Name)]
- Use -->|"data"| for labeled flows

EXAMPLE:
graph LR
    User[User] -->|"credentials"| P1([Validate Login])
    P1 -->|"query"| DB1[(User Database)]
    DB1 -->|"user record"| P1
    P1 -->|"token"| User
    P1 -->|"log event"| DB2[(Audit Log])`;

    case "sequence":
      return base + `Generate a detailed Mermaid sequenceDiagram.
RULES:
- First line: sequenceDiagram
- Use ->> for sync calls, -->> for responses
- Use activate/deactivate for lifelines
- Include at least 3 participants and 6 messages
- Use Note over or Note right of for important info

EXAMPLE:
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database
    User->>Frontend: Submit Form
    Frontend->>API: POST /submit
    activate API
    API->>Database: INSERT record
    Database-->>API: OK
    deactivate API
    API-->>Frontend: 200 Success
    Frontend-->>User: Show confirmation`;

    case "activity":
      return base + `Generate a Mermaid activity diagram using flowchart TD with swimlanes if applicable.
RULES:
- First line: flowchart TD
- Use subgraph for swimlanes
- Include fork/join with parallel activities
- Start: ([Start]), End: ([End])
- Decision diamonds with labeled branches

EXAMPLE:
flowchart TD
    subgraph System
        S1[Receive Request]
        S2{Authenticate?}
        S3[Process Request]
        S4[Return Response]
    end
    subgraph Database
        D1[Query Data]
        D2[Update Record]
    end
    Start([Start]) --> S1
    S1 --> S2
    S2 -->|Yes| S3
    S2 -->|No| Reject([Reject])
    S3 --> D1
    D1 --> D2
    D2 --> S4
    S4 --> End([End])`;

    case "architecture":
      return base + `Generate a Mermaid system architecture diagram using graph TB.
RULES:
- Use subgraph for layers/tiers
- Include: Frontend, Backend/API, Database, External Services
- Show all connections between components
- Use clear descriptive labels

EXAMPLE:
graph TB
    subgraph Frontend
        UI[Web App]
        Mobile[Mobile App]
    end
    subgraph Backend
        API[REST API]
        Auth[Auth Service]
        Worker[Background Worker]
    end
    subgraph Data
        DB[(PostgreSQL)]
        Cache[(Redis)]
        Queue[Message Queue]
    end
    UI --> API
    Mobile --> API
    API --> Auth
    API --> DB
    API --> Cache
    Worker --> Queue
    Worker --> DB`;

    case "component":
      return base + `Generate a Mermaid component diagram using graph LR.
RULES:
- Use subgraph for packages/modules
- Show interfaces and dependencies clearly
- Use --> for depends-on, --o for uses interface

EXAMPLE:
graph LR
    subgraph UI Layer
        WebUI[Web Interface]
        MobileUI[Mobile Interface]
    end
    subgraph Service Layer
        AuthSvc[Auth Service]
        OrderSvc[Order Service]
        PaymentSvc[Payment Service]
    end
    subgraph Data Layer
        UserRepo[User Repository]
        OrderRepo[Order Repository]
    end
    WebUI --> AuthSvc
    WebUI --> OrderSvc
    OrderSvc --> PaymentSvc
    AuthSvc --> UserRepo
    OrderSvc --> OrderRepo`;

    case "state":
      return base + `Generate a Mermaid stateDiagram-v2.
RULES:
- First line: stateDiagram-v2
- Use [*] for start and end states
- Use --> for transitions with labels
- Use state "Description" as StateName for composite states

EXAMPLE:
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : submit
    Processing --> Success : complete
    Processing --> Failed : error
    Failed --> Idle : retry
    Success --> [*]`;

    case "mindmap":
      return base + `Generate a Mermaid mindmap.
RULES:
- First line: mindmap
- Use indentation for hierarchy
- Root node at top level
- Use shapes: ((root)), [branch], (leaf)

EXAMPLE:
mindmap
  root((System))
    Users
      Admin
      Customer
      Manager
    Features
      Authentication
      Dashboard
      Reports
    Technology
      Frontend
      Backend
      Database`;

    case "timeline":
      return base + `Generate a Mermaid timeline diagram.
RULES:
- First line: timeline
- Use "title" for the title
- Use "section" for phases
- Format: YYYY : Event description

EXAMPLE:
timeline
    title Project Timeline
    section Planning
        2024-01 : Requirements gathered
        2024-02 : Design approved
    section Development
        2024-03 : Backend complete
        2024-04 : Frontend complete
    section Launch
        2024-05 : Testing done
        2024-06 : Go live`;

    case "network":
      return base + `Generate a Mermaid network/infrastructure diagram using graph TB.
RULES:
- Show network topology with nodes and connections
- Use subgraph for network zones
- Include: Internet, DMZ, Internal network, servers

EXAMPLE:
graph TB
    Internet[🌐 Internet]
    subgraph DMZ
        LB[Load Balancer]
        WAF[Web Application Firewall]
    end
    subgraph Internal
        App1[App Server 1]
        App2[App Server 2]
        DB[(Database Cluster)]
    end
    Internet --> WAF
    WAF --> LB
    LB --> App1
    LB --> App2
    App1 --> DB
    App2 --> DB`;

    default:
      return base + `Generate a Mermaid flowchart TD diagram showing the main flow.
RULES:
- First line: flowchart TD
- Include start and end nodes
- Show all main steps and decision points`;
  }
}

// ── Call Mistral with retry ────────────────────────────────────────────────

async function callMistral(prompt: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 3000));

      const res = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + MISTRAL_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2000,
          temperature: 0.2,
        }),
        signal: ctrl.signal,
      });

      clearTimeout(timer);

      if (res.status === 429 && attempt < 2) continue;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } catch (e: any) {
      if (e.name === "AbortError" || attempt === 2) throw e;
    }
  }
  throw new Error("Mistral failed after 3 attempts");
}

// ── Clean Mermaid output ───────────────────────────────────────────────────

function cleanMermaid(raw: string): string {
  // Check for validation errors first
  if (raw.includes("VALIDATION_ERROR:")) {
    throw new Error(raw.replace("VALIDATION_ERROR: ", ""));
  }

  // Strip markdown code fences
  let code = raw
    .replace(/^```mermaid\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  // If output has extra text before the diagram keyword, strip it
  const keywords = ["erDiagram", "classDiagram", "sequenceDiagram", "stateDiagram",
    "flowchart", "graph ", "mindmap", "timeline", "gitGraph"];
  for (const kw of keywords) {
    const idx = code.indexOf(kw);
    if (idx > 0) {
      code = code.slice(idx);
      break;
    }
  }

  return code.trim();
}

// ── Main handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    if (!MISTRAL_API_KEY) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    const formData = await request.formData();
    const diagramType = (formData.get("diagram_type") as string)?.trim() || "flowchart";
    const originalText = (formData.get("text") as string) || "";
    const extractedRaw = formData.get("extracted") as string;

    let extracted: any = {};
    try {
      if (extractedRaw) extracted = JSON.parse(extractedRaw);
    } catch { /* ignore */ }

    if (!originalText && !extractedRaw) {
      return NextResponse.json({ error: "text or extracted data required" }, { status: 400 });
    }

    const prompt = buildPrompt(diagramType, extracted, originalText);
    const t0 = Date.now();

    let raw = "";
    try {
      raw = await callMistral(prompt);
    } catch {
      // Return a safe fallback diagram
      raw = getFallback(diagramType);
    }

    const mermaid = cleanMermaid(raw) || getFallback(diagramType);

    return NextResponse.json({
      mermaid_syntax: mermaid,
      diagram_type: diagramType,
      processing_time_ms: Date.now() - t0,
      success: true,
    });
  } catch (error: any) {
    console.error("D2D generate error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}

// ── Fallback diagrams (always valid Mermaid) ──────────────────────────────

function getFallback(type: string): string {
  const fallbacks: Record<string, string> = {
    er: `erDiagram
    USER {
        int id PK
        string membership_id
        string name
        string email
        string phone
        date membership_date
        boolean is_active
    }
    BOOK {
        int id PK
        string isbn
        string title
        string author
        string publisher
        int publication_year
        boolean is_available
        string location
    }
    LOAN {
        int id PK
        int user_id FK
        int book_id FK
        date borrowed_date
        date due_date
        date returned_date
        string status
        float fine_amount
    }
    USER ||--o{ LOAN : "makes"
    BOOK ||--o{ LOAN : "involved_in"`,

    class: `classDiagram
    class User {
        +int id
        +string email
        +string name
        -string password
        +login() bool
        +logout() void
        +getProfile() User
    }
    class Order {
        +int id
        +float total
        +string status
        +getItems() List
        +cancel() void
    }
    class Product {
        +int id
        +string name
        +float price
        +checkStock() bool
    }
    User "1" --> "*" Order : places
    Order "*" --> "*" Product : contains`,

    flowchart: `flowchart TD
    Start([Start]) --> Input[User Input]
    Input --> Validate{Valid?}
    Validate -->|Yes| Process[Process Request]
    Validate -->|No| Error[Show Error]
    Error --> Input
    Process --> Auth{Authenticated?}
    Auth -->|Yes| Execute[Execute Operation]
    Auth -->|No| Login[Redirect to Login]
    Execute --> Save[Save to Database]
    Save --> Response[Return Response]
    Response --> End([End])`,

    sequence: `sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database
    User->>Frontend: Submit Form
    Frontend->>API: POST /api/submit
    activate API
    API->>Database: INSERT INTO records
    Database-->>API: Record Created
    deactivate API
    API-->>Frontend: 201 Created
    Frontend-->>User: Show Success`,

    usecase: `graph TD
    User((User))
    Admin((Admin))
    System((System))
    UC1[Register]
    UC2[Login]
    UC3[View Dashboard]
    UC4[Manage Data]
    UC5[Generate Reports]
    UC6[Manage Users]
    User --> UC1
    User --> UC2
    User --> UC3
    User --> UC4
    Admin --> UC2
    Admin --> UC5
    Admin --> UC6
    System --> UC5`,

    architecture: `graph TB
    subgraph Client
        Web[Web Browser]
        Mobile[Mobile App]
    end
    subgraph API_Gateway
        LB[Load Balancer]
        Gateway[API Gateway]
    end
    subgraph Services
        Auth[Auth Service]
        Core[Core Service]
        Notify[Notification Service]
    end
    subgraph Data
        DB[(PostgreSQL)]
        Cache[(Redis)]
        Queue[Message Queue]
    end
    Web --> LB
    Mobile --> LB
    LB --> Gateway
    Gateway --> Auth
    Gateway --> Core
    Core --> DB
    Core --> Cache
    Core --> Queue
    Queue --> Notify`,

    dfd: `graph LR
    User[User] -->|request| P1([Process Request])
    P1 -->|validate| P2([Validate Data])
    P2 -->|store| DB1[(Main Database)]
    DB1 -->|retrieve| P3([Fetch Results])
    P3 -->|response| User
    P2 -->|log| DB2[(Audit Log])`,

    activity: `flowchart TD
    Start([Start]) --> Receive[Receive Request]
    subgraph Validation
        Receive --> CheckAuth{Authenticated?}
        CheckAuth -->|No| Reject([Unauthorized])
        CheckAuth -->|Yes| CheckData{Data Valid?}
        CheckData -->|No| ReturnError[Return Error]
        ReturnError --> End1([End])
    end
    subgraph Processing
        CheckData -->|Yes| Process[Process Data]
        Process --> SaveDB[Save to Database]
        SaveDB --> Notify[Send Notification]
    end
    Notify --> Respond[Return Response]
    Respond --> End2([End])`,

    component: `graph LR
    subgraph Frontend
        UI[UI Components]
        Store[State Store]
        Router[Router]
    end
    subgraph Backend
        API[REST API]
        Auth[Auth Module]
        Services[Business Logic]
    end
    subgraph Data
        ORM[ORM Layer]
        DB[(Database)]
        Cache[(Cache)]
    end
    UI --> Store
    UI --> Router
    Router --> API
    API --> Auth
    API --> Services
    Services --> ORM
    ORM --> DB
    Services --> Cache`,

    schema: `erDiagram
    USERS {
        int id PK
        string email
        string full_name
        string password_hash
        string plan
        date created_at
        boolean is_active
    }
    PROJECTS {
        int id PK
        int user_id FK
        string name
        string description
        string dialect
        date created_at
    }
    SESSIONS {
        int id PK
        int user_id FK
        string token
        date expires_at
        date created_at
    }
    USERS ||--o{ PROJECTS : "owns"
    USERS ||--o{ SESSIONS : "has"`,

    state: `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading : fetch_data
    Loading --> Success : data_received
    Loading --> Error : request_failed
    Error --> Loading : retry
    Error --> Idle : cancel
    Success --> Processing : user_action
    Processing --> Success : complete
    Processing --> Error : failed
    Success --> [*] : done`,

    mindmap: `mindmap
  root((Application))
    Frontend
      Components
      State Management
      Routing
    Backend
      API Endpoints
      Authentication
      Database
    Infrastructure
      Hosting
      CI/CD
      Monitoring`,

    timeline: `timeline
    title Development Timeline
    section Phase 1
        Week 1 : Requirements & Design
        Week 2 : Database Schema
    section Phase 2
        Week 3 : Backend API
        Week 4 : Frontend UI
    section Phase 3
        Week 5 : Testing
        Week 6 : Deployment`,

    network: `graph TB
    Internet[🌐 Internet]
    subgraph DMZ_Zone
        FW[Firewall]
        LB[Load Balancer]
    end
    subgraph App_Zone
        App1[App Server 1]
        App2[App Server 2]
        Cache[Cache Server]
    end
    subgraph DB_Zone
        Primary[(Primary DB)]
        Replica[(Replica DB)]
    end
    Internet --> FW
    FW --> LB
    LB --> App1
    LB --> App2
    App1 --> Cache
    App2 --> Cache
    App1 --> Primary
    App2 --> Primary
    Primary --> Replica`,
  };

  return fallbacks[type] || fallbacks["flowchart"];
}
