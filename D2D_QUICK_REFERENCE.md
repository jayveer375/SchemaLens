# D2D Feature - Quick Reference Guide

**Last Updated**: September 21, 2026  
**Feature Status**: ✅ Design Complete - Ready for Implementation  

---

## OVERVIEW

D2D (Document to Diagram) allows SchemaLens Premium users to convert documents, images, and text into 10 types of diagrams using Mistral AI.

---

## QUICK FACTS

| Aspect | Details |
|--------|---------|
| **Feature Name** | Document to Diagram (D2D) |
| **User Tier** | Premium (Pro plan) |
| **Diagram Types** | 10: ER, Class, UseCase, Flowchart, DFD, Sequence, Activity, Architecture, Component, Schema |
| **Input Methods** | 3: Upload Image, Upload Document, Enter Text |
| **Document Types** | PDF, DOCX, TXT (max 10MB) |
| **Image Types** | PNG, JPG, JPEG, WEBP (max 10MB) |
| **Text Max Length** | 5000 characters |
| **Output Format** | Mermaid syntax + optional SQL |
| **Export Formats** | PNG, SVG, PDF, Mermaid code |
| **Rate Limit** | 100 D2D requests per hour per user |
| **Cost to User** | Included in ₹699/month Pro plan |
| **Cost to SchemaLens** | Mistral API usage (Mistral-small-latest) |
| **Processing Time** | 2-30 seconds typically |
| **Premium Gating** | Backend enforced (HTTP 402 if free) |

---

## DATABASE

### New Table: `d2d_diagrams`

```sql
-- 13th table in SchemaLens
CREATE TABLE d2d_diagrams (
    id INT PK,
    user_id INT FK → users(id) CASCADE,
    diagram_uid VARCHAR(50) UNIQUE,
    diagram_type VARCHAR(50),  -- 'er', 'class', 'usecase', etc.
    input_type VARCHAR(20),    -- 'image', 'document', 'text'
    input_filename VARCHAR(255),
    input_content_preview TEXT (first 500 chars),
    mermaid_syntax TEXT,       -- Generated Mermaid code
    generated_sql TEXT,        -- Optional for ER/Schema
    recommended_type VARCHAR(50),
    user_selected_type VARCHAR(50),
    status VARCHAR(20),        -- 'processing', 'completed', 'failed'
    error_message TEXT,
    processing_time_ms INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- 4 indexes for query performance
CREATE INDEX idx_d2d_diagrams_user_id ON d2d_diagrams(user_id);
CREATE INDEX idx_d2d_diagrams_diagram_type ON d2d_diagrams(diagram_type);
CREATE INDEX idx_d2d_diagrams_created_at ON d2d_diagrams(created_at DESC);
CREATE INDEX idx_d2d_diagrams_status ON d2d_diagrams(status);
```

### Activity Logging

**Existing Tables Extended**:
- `user_activity`: Add activities `d2d_analyze`, `d2d_generate`, `d2d_export`, `d2d_delete`
- `tool_history`: Add tool='d2d' with action_label and extra_json metadata

---

## API ENDPOINTS

### Backend Routes (6 total)

```
POST   /api/d2d/analyze-image        → Analyze image, recommend diagram
POST   /api/d2d/analyze-document     → Analyze doc, recommend diagram
POST   /api/d2d/analyze-text         → Analyze text, recommend diagram
POST   /api/d2d/generate             → Generate Mermaid for selected type
GET    /api/d2d/diagrams/{user_id}   → Fetch user's diagram history
DELETE /api/d2d/diagram/{diagram_uid}→ Delete diagram
```

### Frontend Routes (6 proxy routes)

```
POST   /api/d2d/analyze-image/route.ts
POST   /api/d2d/analyze-document/route.ts
POST   /api/d2d/analyze-text/route.ts
POST   /api/d2d/generate/route.ts
POST   /api/d2d/upload-document/route.ts
POST   /api/d2d/export/route.ts
```

### Navigation

Add D2D link to:
- `frontend/components/layout/Sidebar.tsx` (sidebar menu)
- `frontend/components/layout/Navbar.tsx` (main navbar)
- Route: `/d2d`

---

## MISTRAL PROMPTS

### 4 Main Analyzer Prompts

1. **Image Analyzer**: Extract entities, relationships, processes, components from image
2. **Document Analyzer**: Extract text from PDF/DOCX/TXT, analyze content
3. **Text Analyzer**: Analyze user text, recommend diagram types
4. **Diagram Generators** (1 per type): Generate Mermaid syntax for each diagram type

All prompts follow JSON output format (extract with `extract_json_from_response()`)

---

## SECURITY

### File Validation
```
Image:     PNG, JPG, JPEG, WEBP | Max 10MB | MIME type checked | Filename sanitized
Document:  PDF, DOCX, TXT       | Max 10MB | MIME type checked | Text only extracted
Text:      Max 5000 chars       | XSS prevented in prompts
```

### API Security
```
Authentication:     JWT required on all endpoints
User Isolation:     Can only access own diagrams
Premium Gating:     Backend enforced (HTTP 402 if not Pro)
Rate Limiting:      100 per hour per user
API Keys:          Server-side only (never exposed to browser)
HTTPS:             All API calls encrypted
```

### Data Protection
```
User documents:    Server-side only, never logged
Diagrams:          Encrypted at rest (optional)
Activity logs:     Full audit trail
GDPR:              Cascade delete on user deletion
Data retention:    Deleted with user account
```

---

## PREMIUM GATING

### Backend Check (All Endpoints)
```python
if user.plan != 'pro':
    return HTTPException(status_code=402, detail="Premium required")
```

### HTTP Status Codes
```
200  OK - Success
400  Bad Request - Invalid input
402  Upgrade Required - Premium needed
403  Forbidden - Suspended/inactive account
404  Not Found - Resource missing
429  Too Many Requests - Rate limit exceeded
500  Internal Server Error - API error
```

---

## COMPONENT ARCHITECTURE

### Frontend Components (5 new)

```
D2DPage
├── D2DInputCards (3 input methods)
│   ├── Upload Image card
│   ├── Upload Document card
│   └── Enter Text card
├── D2DAnalysisResult (after analysis)
│   ├── Recommended diagram display
│   ├── Diagram type selector
│   └── Confidence indicator
├── D2DMermaidEditor (diagram viewer)
│   ├── Live Mermaid preview
│   ├── Monaco code editor
│   ├── Download buttons
│   └── Save button
└── D2DHistory (sidebar)
    ├── Diagram list (filterable)
    ├── Delete buttons
    └── Search
```

### State Management (Zustand)

```typescript
D2DSlice {
  diagrams: D2DDiagram[]
  currentDiagramUid: string | null
  currentMermaid: string | null
  recommendedType: string | null
  selectedType: string | null
  isAnalyzing: boolean
  isGenerating: boolean
  error: string | null
  
  addDiagram(diagram)
  setCurrentDiagram(uid)
  setRecommendedType(type)
  setSelectedType(type)
  setMermaid(code)
  deleteDiagram(uid)
  clearError()
  setAnalyzing(bool)
  setGenerating(bool)
}
```

---

## USER WORKFLOW

```
1. Navigate to /d2d
   ↓
2. Choose input:
   - Upload Image
   - Upload Document (PDF/DOCX/TXT)
   - Enter Text
   ↓
3. System analyzes (Mistral API call):
   - Shows "Analyzing..."
   - Extracts content
   ↓
4. System recommends diagram type(s)
   ↓
5. User can:
   - Accept recommendation
   - Change diagram type
   - Re-analyze
   ↓
6. System generates Mermaid diagram
   ↓
7. User sees preview with actions:
   - Download (PNG/SVG/PDF/Mermaid)
   - Copy code
   - Save to account
   - Edit code
   - Regenerate
   ↓
8. Saved diagrams in history sidebar
```

---

## FILES CREATED

### Backend
- `routes/d2d.py` - 6 API endpoints + helpers
- `database/migrate_d2d_tables.py` - Migration script
- `services/d2d_analyzer.py` - Mistral prompts (To create)

### Frontend
- `components/pages/D2DPage.tsx`
- `components/D2DInputCards.tsx`
- `components/D2DAnalysisResult.tsx`
- `components/D2DMermaidEditor.tsx`
- `components/D2DHistory.tsx`
- `app/api/d2d/analyze-image/route.ts`
- `app/api/d2d/analyze-document/route.ts`
- `app/api/d2d/analyze-text/route.ts`
- `app/api/d2d/generate/route.ts`
- `app/api/d2d/upload-document/route.ts`
- `app/api/d2d/export/route.ts`

---

## FILES MODIFIED

### Backend
- `app.py` - Import D2D router
- `models.py` - Add D2DDiagram model

### Frontend
- `lib/store.ts` - Add D2DSlice
- `components/layout/Sidebar.tsx` - Add D2D link
- `components/layout/Navbar.tsx` - Add D2D link
- `app/layout.tsx` - Add D2D route
- `lib/subscription.ts` - Track D2D usage
- `.env.example` - Add D2D env vars

---

## ENVIRONMENT VARIABLES

```bash
# D2D Configuration (all optional with sensible defaults)
D2D_MAX_IMAGE_SIZE_MB=10
D2D_MAX_DOCUMENT_SIZE_MB=10
D2D_MAX_TEXT_LENGTH=5000
D2D_PROCESSING_TIMEOUT_SEC=120
D2D_ENABLE_FEATURE=true
D2D_RATE_LIMIT_PER_HOUR=100
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Database
- [ ] Run migration: `python database/migrate_d2d_tables.py`
- [ ] Verify table created
- [ ] Verify indexes created

### Phase 2: Backend
- [ ] Add D2DDiagram model to models.py
- [ ] Create routes/d2d.py with 6 endpoints
- [ ] Create services/d2d_analyzer.py with Mistral prompts
- [ ] Import router in app.py
- [ ] Test endpoints locally

### Phase 3: Frontend
- [ ] Create D2D page component
- [ ] Create input cards component
- [ ] Create analysis result component
- [ ] Create Mermaid editor component
- [ ] Create history component
- [ ] Add to navigation (Sidebar + Navbar)
- [ ] Add to router
- [ ] Create Zustand D2DSlice

### Phase 4: Integration
- [ ] Connect frontend to backend APIs
- [ ] Test end-to-end flows
- [ ] Premium gating tests
- [ ] Security tests

### Phase 5: Deployment
- [ ] Code review
- [ ] Run tests
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Deploy to production

---

## TESTING ESSENTIALS

### Backend
```bash
# Test analyze-image endpoint
curl -X POST http://localhost:8000/api/d2d/analyze-image \
  -F "user_id=1" \
  -F "image_id=uuid-from-upload"

# Test analyze-text endpoint
curl -X POST http://localhost:8000/api/d2d/analyze-text \
  -F "user_id=1" \
  -F "text=My system has users and orders"

# Test premium gating (free user)
# Should return HTTP 402 with upgrade_url
```

### Frontend
- Upload image → analyze → get recommended type ✓
- Upload document → analyze → select type → generate ✓
- Enter text → analyze → generate diagram ✓
- Download/copy/save diagram ✓
- Free user sees upgrade message ✓

---

## TROUBLESHOOTING

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 402 Error | Free user accessing D2D | Upgrade user to Pro or check User.plan |
| 429 Error | Rate limit exceeded | Wait 1 hour or check `user.plan != 'pro'` |
| Mistral timeout | Large file or slow API | Increase `D2D_PROCESSING_TIMEOUT_SEC` |
| Invalid JSON from Mistral | Prompt format issue | Check `extract_json_from_response()` |
| Mermaid render fails | Invalid syntax | Validate Mermaid code online: mermaid.live |
| File upload fails | MIME type not whitelisted | Check `IMAGE_MIMETYPES` or `DOCUMENT_MIMETYPES` |

---

## PERFORMANCE TARGETS

| Operation | Target Time |
|-----------|------------|
| Image analysis (< 5MB) | < 30 seconds |
| Document analysis (< 5MB) | < 30 seconds |
| Text analysis | < 10 seconds |
| Diagram generation | < 10 seconds |
| Mermaid rendering (browser) | < 2 seconds |
| Total E2E flow | < 60 seconds |

---

## MONITORING

### Key Metrics
- D2D request count per hour/day/month
- Average processing time per request type
- Error rate (% of failed requests)
- Mistral API usage (tokens, cost)
- User conversion rate (free → Pro)
- Most used diagram types

### Alerts
- Mistral API rate limit exceeded
- D2D error rate > 5%
- Processing time > 60 seconds
- Database query timeout

---

## SUPPORT RESOURCES

- **Design Document**: `D2D_DESIGN_DOCUMENT.md` (comprehensive)
- **Implementation Guide**: `D2D_IMPLEMENTATION_SUMMARY.md` (detailed)
- **Backend Code**: `routes/d2d.py`
- **Frontend Code**: `components/pages/D2DPage.tsx`
- **Database Migration**: `database/migrate_d2d_tables.py`

---

## NEXT STEPS

1. ✅ **Design Complete** (this document)
2. 📋 **Development Queue**: 
   - Backend implementation (routes, services)
   - Frontend implementation (components, UI)
   - Testing (unit, integration, E2E)
3. 🚀 **Deployment**: Stage → Production
4. 📊 **Monitoring**: Track usage and errors
5. 🎉 **Launch**: Announce to users

---

**Questions?** Refer to full design document or implementation guide.

**Last Updated**: September 21, 2026  
**Status**: ✅ Ready for Development
