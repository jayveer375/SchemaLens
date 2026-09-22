# D2D (Document to Diagram) Feature - Design & Integration Plan

**Version**: 1.0  
**Date**: September 21, 2026  
**Status**: Design Phase  
**Priority**: High  

---

## 1. OVERVIEW

### Feature Description
D2D (Document to Diagram) allows SchemaLens users to convert documents, images, and text into various diagram types (ER, Class, Use Case, Flowchart, DFD, Sequence, Activity, Architecture, Component, Schema). The feature integrates seamlessly with existing SchemaLens infrastructure and is gated behind the Premium plan.

### Inputs
- **Upload Image**: ER diagrams, screenshots, hand-drawn sketches
- **Upload Document**: PDF/DOCX/TXT (SRS, requirements, specs, API docs, flow diagrams)
- **Paste Text**: Direct text/description input

### Outputs
- Diagram in **Mermaid syntax** (rendered in browser + saved as SVG/PNG/PDF)
- Optional DDL SQL (for ER/Schema diagrams)
- Downloadable formats: PNG, SVG, PDF
- Copyable Mermaid code

---

## 2. DATABASE SCHEMA CHANGES

### New Tables

#### `d2d_diagrams`
```sql
CREATE TABLE d2d_diagrams (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diagram_uid VARCHAR(50) UNIQUE NOT NULL,
    diagram_type VARCHAR(50) NOT NULL,  -- 'er', 'class', 'usecase', 'flowchart', 'dfd', 'sequence', 'activity', 'architecture', 'component', 'schema'
    input_type VARCHAR(20) NOT NULL,  -- 'image', 'document', 'text'
    input_filename VARCHAR(255),
    input_content_preview TEXT,  -- First 500 chars of extracted content
    mermaid_syntax TEXT NOT NULL,
    generated_sql TEXT,  -- For ER/Schema diagrams
    recommended_type VARCHAR(50),  -- Auto-detected type before user selection
    user_selected_type VARCHAR(50),  -- Final type user chose
    status VARCHAR(20) DEFAULT 'completed',  -- 'processing', 'completed', 'failed'
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### `d2d_conversions` (Extended Tool History)
Already covered by extending `tool_history` table:
```
tool='d2d'
action_label: 'd2d_image_analyze', 'd2d_document_analyze', 'd2d_text_analyze'
extra_json: {input_type, diagram_type, recommended_type}
```

### Table Extensions

#### `user_activity` - Add D2D entries
```
activity_type: 
  - 'd2d_analyze' (on upload/input)
  - 'd2d_generate' (on diagram generation)
  - 'd2d_regenerate' (on retry)
  - 'd2d_export' (on download/copy)
  - 'd2d_save' (on save to account)
```

#### `images` - Already supports D2D images
```
No changes needed - reuse existing structure
processing_status: 'pending' → 'processing' → 'completed'/'failed'
```

### Migration SQL
```sql
-- Create d2d_diagrams table
CREATE TABLE d2d_diagrams (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diagram_uid VARCHAR(50) UNIQUE NOT NULL,
    diagram_type VARCHAR(50) NOT NULL,
    input_type VARCHAR(20) NOT NULL,
    input_filename VARCHAR(255),
    input_content_preview TEXT,
    mermaid_syntax TEXT NOT NULL,
    generated_sql TEXT,
    recommended_type VARCHAR(50),
    user_selected_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'completed',
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for quick queries
CREATE INDEX idx_d2d_diagrams_user_id ON d2d_diagrams(user_id);
CREATE INDEX idx_d2d_diagrams_diagram_type ON d2d_diagrams(diagram_type);
CREATE INDEX idx_d2d_diagrams_created_at ON d2d_diagrams(created_at DESC);
```

---

## 3. BACKEND API ENDPOINTS

### D2D Analysis Endpoints

#### `POST /api/d2d/analyze-image`
**Purpose**: Analyze uploaded image and recommend diagram type(s)

**Authentication**: Required (JWT token)

**Request**:
```json
{
  "user_id": "int",
  "image_id": "string (UUID from /upload-image)",
  "diagram_type": "string (optional - 'auto' for smart detection)"
}
```

**Process**:
1. Validate user is authenticated & plan is 'pro'
2. Check D2D conversion limit (unlimited for pro, 0 for free)
3. Fetch image from DB (Image table)
4. Convert to base64
5. Send to Mistral with D2D Image Analyzer prompt
6. Parse response: extract recommended_type, entities, relationships
7. Store in d2d_diagrams table with status='completed'
8. Log to user_activity as 'd2d_analyze'
9. Log to tool_history as tool='d2d'

**Response**:
```json
{
  "diagram_uid": "uuid",
  "recommended_type": "er",
  "detected_entities": 20,
  "detected_relationships": 15,
  "confidence": "high",
  "message": "Detected ER diagram. Entities and relationships identified."
}
```

**Status Code**: 200 on success, 402 if Premium required, 400 if validation fails, 500 on API error

---

#### `POST /api/d2d/analyze-document`
**Purpose**: Extract content from document and recommend diagram type(s)

**Authentication**: Required

**Request**:
```json
{
  "user_id": "int",
  "file_id": "string (UUID from /d2d/upload-document)"
}
```

**Process**:
1. Validate user & plan
2. Fetch document from storage
3. Parse based on file type:
   - **PDF**: Use PyPDF2 or pdfplumber to extract text
   - **DOCX**: Use python-docx to extract text
   - **TXT**: Read directly
4. Extract first 2000 chars (or full if smaller)
5. Send to Mistral with D2D Document Analyzer prompt
6. Parse response: recommended_type, key_entities, key_flows
7. Store in d2d_diagrams table
8. Log activity

**Response**:
```json
{
  "diagram_uid": "uuid",
  "recommended_types": ["usecase", "flowchart", "dfd"],
  "extracted_preview": "...",
  "confidence": "medium",
  "detected_actors": 5,
  "detected_processes": 8
}
```

---

#### `POST /api/d2d/analyze-text`
**Purpose**: Analyze user-provided text description

**Authentication**: Required

**Request**:
```json
{
  "user_id": "int",
  "text": "string (max 5000 chars)"
}
```

**Process**:
1. Validate user & plan
2. Send text to Mistral with D2D Text Analyzer prompt
3. Parse response: recommended_type, entities, flows
4. Store in d2d_diagrams table (input_type='text')
5. Log activity

**Response**:
```json
{
  "diagram_uid": "uuid",
  "recommended_types": ["flowchart", "activity"],
  "confidence": "medium"
}
```

---

#### `POST /api/d2d/generate`
**Purpose**: Generate Mermaid diagram from analyzed content

**Authentication**: Required

**Request**:
```json
{
  "user_id": "int",
  "diagram_uid": "string",
  "diagram_type": "string (one of: er, class, usecase, flowchart, dfd, sequence, activity, architecture, component, schema)",
  "include_sql": "boolean (optional, default=false for non-ER)"
}
```

**Process**:
1. Fetch d2d_diagram record
2. Validate user owns diagram
3. Call Mistral with D2D Generator prompt (specific to diagram_type)
4. Parse Mermaid syntax from response
5. If diagram_type in ['er', 'schema']: optionally generate SQL
6. Update d2d_diagrams: mermaid_syntax, user_selected_type, generated_sql
7. Log to tool_history

**Response**:
```json
{
  "mermaid_syntax": "graph TD...",
  "generated_sql": "CREATE TABLE... (optional)",
  "diagram_preview_url": "/api/d2d/preview/{diagram_uid}",
  "processing_time_ms": 2150
}
```

---

#### `GET /api/d2d/diagrams/{user_id}`
**Purpose**: Fetch user's D2D diagram history

**Query Params**:
- `limit`: int (default 20, max 100)
- `offset`: int (default 0)
- `type`: string (filter by diagram_type, optional)

**Response**:
```json
{
  "diagrams": [
    {
      "diagram_uid": "uuid",
      "diagram_type": "er",
      "input_type": "image",
      "recommended_type": "er",
      "user_selected_type": "er",
      "status": "completed",
      "created_at": "2026-09-21T10:00:00Z",
      "processing_time_ms": 2150
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

---

#### `GET /api/d2d/diagram/{diagram_uid}`
**Purpose**: Fetch specific diagram details

**Response**:
```json
{
  "diagram_uid": "uuid",
  "diagram_type": "er",
  "input_type": "image",
  "input_filename": "schema.png",
  "mermaid_syntax": "...",
  "generated_sql": "...",
  "recommended_type": "er",
  "user_selected_type": "er",
  "created_at": "2026-09-21T10:00:00Z",
  "processing_time_ms": 2150
}
```

---

#### `DELETE /api/d2d/diagram/{diagram_uid}`
**Purpose**: Delete a saved diagram

**Process**:
1. Validate user owns diagram
2. Delete from d2d_diagrams
3. Delete associated image if exists
4. Log activity as 'd2d_delete'

**Response**: `{"message": "Diagram deleted"}`

---

#### `POST /api/d2d/upload-document`
**Purpose**: Upload document for D2D analysis

**Request**: multipart/form-data
- `user_id`: int
- `document`: file (PDF/DOCX/TXT, max 10MB)

**Response**:
```json
{
  "file_id": "uuid",
  "filename": "requirements.pdf",
  "file_size_bytes": 245000,
  "mime_type": "application/pdf"
}
```

---

#### `POST /api/d2d/export/{diagram_uid}`
**Purpose**: Export diagram in various formats

**Request**:
```json
{
  "format": "mermaid|png|svg|pdf",
  "user_id": "int"
}
```

**Response**: 
- **format=mermaid**: `{"code": "..."}`
- **format=png/svg/pdf**: Binary file download

---

### Premium Gating Implementation

All D2D endpoints include this check:

```python
# Check Premium access
if user.plan != 'pro':
    return {
        "detail": "D2D feature requires Premium plan. Upgrade to access.",
        "upgrade_url": "/pricing"
    }, 402
```

Additionally:
- **Conversion limits**: Pro users get unlimited D2D conversions (no monthly reset)
- **Document size**: Free=no access, Pro=10MB max per file
- **Export formats**: Free=no export, Pro=all formats (mermaid, PNG, SVG, PDF)

---

## 4. MISTRAL PROMPTS FOR D2D

### Phase 1: Image Analysis Prompt (D2D Image Analyzer)

```
You are a professional database and systems architect analyzing diagrams.

Given an image, extract ALL entities, relationships, processes, components, and flows.

OUTPUT FORMAT (JSON):
{
  "diagram_type_detected": "one of: er, class, usecase, flowchart, dfd, sequence, activity, architecture, component, schema",
  "confidence": "high|medium|low",
  "entities": [{"name": "...", "attributes": [...], "type": "table|class|actor|component"}],
  "relationships": [{"from": "...", "to": "...", "type": "1:N|N:N|inheritance|composition"}],
  "processes": [{"name": "...", "description": "...", "inputs": [...], "outputs": [...]}],
  "data_flows": [{"from": "...", "to": "...", "data": "..."}],
  "text_content": "Any readable text from image",
  "notes": "Anything unclear or ambiguous"
}

Analyze carefully. Focus on:
1. Entity boxes → table names
2. Relationship lines → FK relationships
3. Underlines → primary keys
4. Actors/stick figures → use case actors
5. Process boxes → flows/activities
6. Data stores → database entities
7. Arrows → data flows or relationships
```

### Phase 2: Document Content Extraction Prompt (D2D Document Analyzer)

```
You are a technical requirements analyst.

Given the following document content, identify the key information that would be useful for creating diagrams.

DOCUMENT CONTENT:
{document_content}

OUTPUT FORMAT (JSON):
{
  "document_type": "srs|requirements|specification|api_docs|flow_diagram|architecture|other",
  "recommended_diagram_types": ["usecase", "flowchart", "dfd", ...],
  "entities": [{"name": "...", "description": "...", "type": "table|class|actor|component"}],
  "relationships": [{"from": "...", "to": "...", "description": "..."}],
  "processes": [{"name": "...", "description": "...", "steps": [...]}],
  "actors": [{"name": "...", "role": "...", "interactions": [...]}],
  "data_flows": [{"from": "...", "to": "...", "data": "..."}],
  "key_requirements": ["...", "..."],
  "summary": "1-2 sentence summary"
}

Focus on:
1. Nouns → potential entities/actors/components
2. Verbs → potential actions/processes/flows
3. Requirements → use cases
4. Dependencies → relationships
```

### Phase 3: Text Analysis Prompt (D2D Text Analyzer)

```
You are a system design expert.

Given user text description, identify what type of diagram would be most useful.

USER TEXT:
{user_text}

OUTPUT FORMAT (JSON):
{
  "recommended_diagram_types": ["flowchart", "usecase", ...],
  "confidence": "high|medium|low",
  "entities_or_actors": [...],
  "processes_or_interactions": [...],
  "summary": "...",
  "reason": "Why these diagrams are recommended"
}
```

### Phase 4: Mermaid Generator Prompts (by Diagram Type)

#### ER Diagram
```
Generate a complete Mermaid ER diagram based on the following analysis:

ENTITIES:
{entities}

RELATIONSHIPS:
{relationships}

REQUIREMENTS:
- Use proper Mermaid ER syntax
- Include all entities with their attributes
- Show relationship cardinality (1 to N, many to many)
- Use clear, professional naming

OUTPUT ONLY the Mermaid code, starting with "erDiagram"

Example format:
erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        int customer_id PK
        string name
        string email
    }
    ORDER {
        int order_id PK
        int customer_id FK
        date order_date
    }
```

#### Class Diagram
```
Generate a complete Mermaid class diagram based on:

CLASSES:
{entities}

RELATIONSHIPS:
{relationships}

REQUIREMENTS:
- Show class names, attributes (with types), and methods
- Use correct cardinality notation
- Show inheritance with proper arrows
- Use professional naming conventions

OUTPUT ONLY the Mermaid code, starting with "classDiagram"

Example:
classDiagram
    class Animal {
        +String name
        +int age
        +void eat()
        +void sleep()
    }
    class Dog {
        +String breed
        +void bark()
    }
    Animal <|-- Dog
```

#### Use Case Diagram
```
Generate a Mermaid use case diagram:

ACTORS:
{actors}

USE CASES:
{processes}

RELATIONSHIPS:
{relationships}

REQUIREMENTS:
- Show actors and use cases clearly
- Show interactions between actors and use cases
- Include relationships (include, extend if applicable)

OUTPUT ONLY Mermaid code starting with "graph" or "usecase"

Example:
graph TD
    Actor1((User))
    Actor2((Admin))
    UC1[Login]
    UC2[View Report]
    UC3[Generate Report]
    
    Actor1 -->|performs| UC1
    Actor1 -->|performs| UC2
    Actor2 -->|performs| UC3
```

#### Flowchart
```
Generate a Mermaid flowchart based on:

PROCESSES:
{processes}

FLOW:
{data_flows}

REQUIREMENTS:
- Clear start/end points
- Decision points where appropriate
- Sequential flow of activities

OUTPUT ONLY Mermaid code starting with "flowchart TD" or "flowchart LR"

Example:
flowchart TD
    Start([Start])
    Input[Input Data]
    Validate{Valid?}
    Process[Process Data]
    Output[Output Result]
    End([End])
    
    Start --> Input
    Input --> Validate
    Validate -->|No| Input
    Validate -->|Yes| Process
    Process --> Output
    Output --> End
```

#### DFD (Data Flow Diagram)
```
Generate a Mermaid diagram representing a DFD:

DATA STORES:
{entities}

PROCESSES:
{processes}

DATA FLOWS:
{data_flows}

OUTPUT ONLY Mermaid code (graph format):

Example:
graph LR
    User((User))
    Process1[Process 1]
    DB1[(Database 1)]
    Process2[Process 2]
    Output((Output))
    
    User -->|Data| Process1
    Process1 -->|Query| DB1
    DB1 -->|Record| Process2
    Process2 -->|Result| Output
```

#### Sequence Diagram
```
Generate a Mermaid sequence diagram based on:

ACTORS:
{actors}

INTERACTIONS:
{processes}

SEQUENCE:
{data_flows}

OUTPUT ONLY Mermaid code starting with "sequenceDiagram"

Example:
sequenceDiagram
    participant User
    participant API
    participant Database
    
    User->>API: Send Request
    API->>Database: Query Data
    Database-->>API: Return Data
    API-->>User: Send Response
```

#### Activity Diagram
```
Generate a Mermaid activity diagram showing the flow of activities:

ACTIVITIES:
{processes}

FLOW:
{data_flows}

OUTPUT ONLY Mermaid code (flowchart or graph format):

Example:
flowchart TD
    Start([Start Activity])
    Activity1[Activity 1]
    Activity2{Decision Point}
    Activity3[Activity 3]
    Activity4[Activity 4]
    End([End Activity])
    
    Start --> Activity1
    Activity1 --> Activity2
    Activity2 -->|Path A| Activity3
    Activity2 -->|Path B| Activity4
    Activity3 --> End
    Activity4 --> End
```

#### Architecture Diagram
```
Generate a Mermaid graph showing system architecture:

COMPONENTS:
{entities}

CONNECTIONS:
{relationships}

OUTPUT graph showing components, services, and data flows:

Example:
graph TB
    Client[Client Application]
    LB[Load Balancer]
    API1[API Server 1]
    API2[API Server 2]
    Cache[Redis Cache]
    DB[Database]
    Queue[Message Queue]
    
    Client -->|Request| LB
    LB -->|Route| API1
    LB -->|Route| API2
    API1 -->|Store| Cache
    API1 -->|Query| DB
    API2 -->|Store| Cache
    API2 -->|Publish| Queue
```

#### Component Diagram
```
Generate a Mermaid diagram showing system components:

COMPONENTS:
{entities}

INTERFACES:
{relationships}

OUTPUT ONLY Mermaid code showing component structure and dependencies:

Example:
graph LR
    Comp1[Component A]
    Comp2[Component B]
    Comp3[Component C]
    
    Comp1 -->|depends on| Comp2
    Comp2 -->|depends on| Comp3
    Comp1 -.->|uses interface| Comp3
```

#### Database Schema Diagram
```
Generate a Mermaid ER diagram for database schema:

TABLES:
{entities}

COLUMNS:
{attributes}

FOREIGN KEYS:
{relationships}

OUTPUT ONLY Mermaid ER code:

Example:
erDiagram
    USERS ||--o{ ORDERS : places
    USERS {
        int user_id PK
        string email UK
        string password_hash
        timestamp created_at
    }
    ORDERS {
        int order_id PK
        int user_id FK
        date order_date
        decimal total_amount
    }
```

---

## 5. FRONTEND COMPONENT ARCHITECTURE

### New Page: `D2DPage.tsx`

Location: `frontend/components/pages/D2DPage.tsx`

Structure:
1. **Three Input Cards** (upload image, upload document, enter text)
2. **Analysis Phase** (show "Recommended Diagram" after analysis)
3. **Diagram Generation** (allow user to select type, generate, preview)
4. **Diagram Editor** (Mermaid preview, download, copy, save)
5. **Diagram History** (sidebar showing saved diagrams)

### State Management: `D2DSlice` in Zustand

```typescript
interface D2DState {
  // Current D2D session
  diagrams: D2DDiagram[];
  currentDiagramUid: string | null;
  currentMermaid: string | null;
  recommendedType: string | null;
  selectedType: string | null;
  isAnalyzing: boolean;
  isGenerating: boolean;
  error: string | null;
  
  // Methods
  addDiagram: (diagram: D2DDiagram) => void;
  setCurrentDiagram: (uid: string) => void;
  setRecommendedType: (type: string) => void;
  setSelectedType: (type: string) => void;
  setMermaid: (code: string) => void;
  deleteDiagram: (uid: string) => void;
  clearError: () => void;
  setAnalyzing: (bool: boolean) => void;
  setGenerating: (bool: boolean) => void;
}
```

### Frontend Routes

Add to router:
- `/d2d` → D2DPage (main page)
- `/d2d/{diagram_uid}` → D2DDetailPage (view saved diagram)

### UI Components

#### `D2DInputCards.tsx`
```
- Upload Image card (drag & drop, file picker)
- Upload Document card (PDF/DOCX/TXT)
- Enter Text card (textarea with placeholder)
```

#### `D2DAnalysisResult.tsx`
```
- Show recommended diagram type(s)
- Show confidence level
- Show preview of detected entities/processes
- Allow user to choose different type
```

#### `D2DMermaidEditor.tsx`
```
- Live Mermaid preview (react-mermaid or mermaid.js)
- Editable Mermaid code (Monaco editor)
- Download buttons (PNG, SVG, PDF, Mermaid)
- Copy to clipboard
- Save to account
```

#### `D2DHistory.tsx`
```
- List of user's saved diagrams
- Filter by type
- Delete individual diagrams
- Search by name/date
```

---

## 6. FRONTEND API CALLS

### New API Routes: `frontend/app/api/d2d/`

#### `frontend/app/api/d2d/analyze-image/route.ts`
- Proxy to `POST /api/d2d/analyze-image`

#### `frontend/app/api/d2d/analyze-document/route.ts`
- Proxy to `POST /api/d2d/analyze-document`

#### `frontend/app/api/d2d/analyze-text/route.ts`
- Proxy to `POST /api/d2d/analyze-text`

#### `frontend/app/api/d2d/generate/route.ts`
- Proxy to `POST /api/d2d/generate`

#### `frontend/app/api/d2d/upload-document/route.ts`
- Handle document upload
- Call `POST /api/d2d/upload-document`

#### `frontend/app/api/d2d/export/route.ts`
- Export diagram in specified format
- Call `POST /api/d2d/export/{diagram_uid}`

---

## 7. PREMIUM GATING IMPLEMENTATION

### Backend Checks (All Endpoints)
```python
# Every D2D endpoint starts with:
@router.post("/api/d2d/...")
def endpoint(...):
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user or user.plan != 'pro':
        raise HTTPException(
            status_code=402,
            detail={
                "message": "D2D requires Premium plan",
                "plan_required": "pro",
                "upgrade_url": "/pricing"
            }
        )
    
    if user.is_suspended or not user.is_active:
        raise HTTPException(status_code=403, detail="Account inactive")
    
    # Proceed with endpoint logic
```

### Frontend Checks
```typescript
// In D2DPage.tsx
const { subscription, user } = useStore();

if (subscription?.planId !== 'pro') {
  return <UpgradeLimitDialog 
    message="D2D feature requires Premium plan"
    onUpgrade={() => navigate('/pricing')}
  />;
}
```

### Billing/Usage Tracking
- D2D conversions are **unlimited** for Pro users (no monthly cap)
- Each conversion logged to `tool_history` (tool='d2d')
- Tracked for analytics but not rate-limited by month

---

## 8. SECURITY CONSIDERATIONS

1. **File Validation**:
   - Images: PNG, JPG, JPEG, WEBP (max 10MB)
   - Documents: PDF, DOCX, TXT (max 10MB)
   - Server-side MIME type validation
   - Filename sanitization (remove special chars)

2. **Content Sanitization**:
   - Extract text from documents safely (no code execution)
   - Limit extracted content length to 5000 chars
   - No eval() or dynamic code execution
   - XSS prevention in Mermaid code (escape user input in prompts)

3. **API Security**:
   - All endpoints require authentication
   - User ID must match authenticated user
   - Premium plan enforced on backend
   - Rate limiting: 100 D2D requests per hour per user
   - API calls to Mistral are server-side (no client-side API key exposure)

4. **Data Privacy**:
   - User documents stored server-side only
   - Diagrams encrypted at rest (if sensitive data)
   - Activity logged for audit trail
   - GDPR-compliant data deletion (cascade delete on user deletion)

---

## 9. ENVIRONMENT VARIABLES (New)

Add to `.env`:
```
# D2D Feature
D2D_MAX_IMAGE_SIZE_MB=10
D2D_MAX_DOCUMENT_SIZE_MB=10
D2D_MAX_TEXT_LENGTH=5000
D2D_PROCESSING_TIMEOUT_SEC=120
D2D_ENABLE_FEATURE=true
D2D_RATE_LIMIT_PER_HOUR=100
```

---

## 10. FILES TO CREATE/MODIFY

### New Files:
1. `database/migrate_d2d_tables.py` - Database migration script
2. `frontend/components/pages/D2DPage.tsx` - Main D2D page
3. `frontend/components/D2DInputCards.tsx` - Input UI
4. `frontend/components/D2DAnalysisResult.tsx` - Analysis display
5. `frontend/components/D2DMermaidEditor.tsx` - Mermaid editor
6. `frontend/components/D2DHistory.tsx` - Saved diagrams
7. `frontend/app/api/d2d/analyze-image/route.ts` - Image analysis route
8. `frontend/app/api/d2d/analyze-document/route.ts` - Document analysis route
9. `frontend/app/api/d2d/analyze-text/route.ts` - Text analysis route
10. `frontend/app/api/d2d/generate/route.ts` - Generate diagram route
11. `frontend/app/api/d2d/upload-document/route.ts` - Document upload route
12. `frontend/app/api/d2d/export/route.ts` - Export route
13. `backend/routes/d2d.py` - Backend D2D routes
14. `backend/services/d2d_analyzer.py` - Mistral integration for D2D

### Modified Files:
1. `app.py` - Add D2D routes import
2. `models.py` - Add D2DDiagram model
3. `frontend/lib/store.ts` - Add D2DSlice to Zustand
4. `frontend/app/layout.tsx` or `AppShell.tsx` - Add D2D to navigation
5. `frontend/components/layout/Sidebar.tsx` - Add D2D link
6. `frontend/lib/subscription.ts` - Extend usage tracking
7. `.env.example` - Add D2D env vars

---

## 11. TESTING CHECKLIST

### Backend Tests:
- [ ] Upload image → analyze → get recommended type
- [ ] Upload document (PDF/DOCX/TXT) → extract content → analyze
- [ ] Paste text → analyze → get recommended diagram types
- [ ] Generate ER diagram from entities
- [ ] Generate use case diagram from actors
- [ ] Generate flowchart from processes
- [ ] Generate DFD from data flows
- [ ] Generate sequence diagram
- [ ] Generate class diagram
- [ ] Generate activity diagram
- [ ] Generate architecture diagram
- [ ] Generate component diagram
- [ ] Generate schema diagram
- [ ] Premium gating: Free user attempts D2D → 402 error
- [ ] Premium user can access all D2D features
- [ ] Export diagram as PNG/SVG/PDF/Mermaid
- [ ] Save diagram to account
- [ ] Fetch diagram history
- [ ] Delete diagram
- [ ] File validation (size, type, MIME)
- [ ] Error handling (missing file, failed Mistral call)

### Frontend Tests:
- [ ] D2D page loads without errors
- [ ] Upload image via drag & drop
- [ ] Upload image via file picker
- [ ] Upload document (PDF/DOCX/TXT)
- [ ] Paste text input
- [ ] Recommended diagram shows after analysis
- [ ] User can change diagram type
- [ ] Diagram generates on "Generate" click
- [ ] Mermaid preview renders correctly
- [ ] Copy Mermaid code works
- [ ] Download PNG/SVG/PDF works
- [ ] Save to account works
- [ ] Diagram history shows saved diagrams
- [ ] Delete diagram from history works
- [ ] Free user sees Premium upgrade message
- [ ] Pro user can access D2D without restrictions
- [ ] Error messages display on upload/generation failure

### Integration Tests:
- [ ] End-to-end: Upload image → Analyze → Generate → Export
- [ ] End-to-end: Upload document → Analyze → Change type → Generate → Save
- [ ] End-to-end: Paste text → Analyze → Generate multiple types
- [ ] Verify existing Quick Convert still works (not broken)
- [ ] Verify existing Generate page still works (not broken)
- [ ] Verify subscription gating doesn't affect existing features
- [ ] Verify tool_history captures D2D actions

---

## 12. DEPLOYMENT CHECKLIST

- [ ] Create database migration and run on production
- [ ] Update `.env` with D2D settings on production
- [ ] Add D2D routes to production API
- [ ] Deploy frontend with D2D components
- [ ] Test premium gating on production
- [ ] Monitor Mistral API usage for D2D
- [ ] Set up monitoring/alerts for D2D errors
- [ ] Document D2D feature in user docs
- [ ] Add D2D to changelog
- [ ] Announce D2D feature to users

---

## 13. ROLLBACK PLAN

If D2D feature needs to be rolled back:
1. Remove D2D links from navigation (frontend)
2. Disable D2D endpoints (set flag in `.env`: D2D_ENABLE_FEATURE=false)
3. Do NOT delete d2d_diagrams table (preserve user data)
4. Notify users of temporary downtime
5. Investigate root cause and fix
6. Re-enable and redeploy

---

## 14. FUTURE ENHANCEMENTS

- Real-time collaboration on diagrams (WebSocket)
- Diagram version history & rollback
- AI-powered diagram suggestions during editing
- Custom diagram templates
- Diagram sharing & public links
- Integration with other tools (GitHub, Figma, etc.)
- Mobile app support for D2D
- Advanced OCR with handwriting recognition
- Multi-language support for document analysis
- Diagram marketplace/templates

---

**END OF D2D DESIGN DOCUMENT**
