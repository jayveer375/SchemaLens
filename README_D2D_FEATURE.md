# D2D Feature - Document to Diagram

**Project**: SchemaLens  
**Feature**: Document to Diagram (D2D) Conversion  
**Status**: ✅ Design Complete - Ready for Implementation  
**Date**: September 21, 2026  

---

## 🎯 WHAT IS D2D?

D2D (Document to Diagram) is a new SchemaLens Premium feature that converts:

- **Documents** (PDF, DOCX, TXT)
- **Images** (PNG, JPG, JPEG, WEBP)
- **Text Descriptions**

Into **10 types of professional diagrams** using Mistral AI:

```
ER Diagram           Class Diagram        Use Case Diagram
Flowchart           DFD (Data Flow)       Sequence Diagram
Activity Diagram    Architecture Diagram  Component Diagram
Database Schema
```

All diagrams are generated in **Mermaid syntax** (open-source, widely supported).

---

## ✨ KEY FEATURES

✅ **10 Diagram Types** - ER, Class, UseCase, Flowchart, DFD, Sequence, Activity, Architecture, Component, Schema

✅ **3 Input Methods** - Upload Image, Upload Document, Paste Text

✅ **Smart Detection** - Auto-recommends diagram type based on content

✅ **User Control** - Change diagram type, regenerate, edit code

✅ **Multiple Exports** - PNG, SVG, PDF, Mermaid code, Copy to clipboard

✅ **Save to Account** - Diagrams persist in user's account

✅ **Premium Feature** - Included in ₹699/month Pro plan

✅ **No Breaking Changes** - Reuses all existing SchemaLens infrastructure

---

## 🚀 QUICK START FOR DEVELOPERS

### Step 1: Understand the Design
```
Read these in order:
1. D2D_QUICK_REFERENCE.md (15 min)
2. D2D_IMPLEMENTATION_SUMMARY.md (1 hour)
3. D2D_DESIGN_DOCUMENT.md (2 hours) - if needed for deep dive
```

### Step 2: Review the Code Structure
```
Backend:
- database/migrate_d2d_tables.py (database migration)
- routes/d2d.py (API endpoints)
- models.py (D2DDiagram model - already added)

Frontend: 11 files to create
- D2DPage.tsx (main page)
- D2DInputCards.tsx (input UI)
- D2DAnalysisResult.tsx (recommendations)
- D2DMermaidEditor.tsx (preview + editor)
- D2DHistory.tsx (saved diagrams)
- 6 API proxy routes

Existing files: 7 to modify
- app.py, models.py, store.ts, etc.
```

### Step 3: Create Tasks
```
Use D2D_FINAL_CHECKLIST.md to break down into:
- Phase 1: Backend (Days 1-2)
- Phase 2: Frontend (Days 3-4)
- Phase 3: Integration (Days 5-6)
- Phase 4: Polish & Deploy (Days 7-8)
```

### Step 4: Implement
```
Follow the 4-phase timeline from D2D_IMPLEMENTATION_SUMMARY.md
Use D2D_FINAL_CHECKLIST.md to track progress
Reference D2D_DESIGN_DOCUMENT.md for technical details
```

---

## 📚 DOCUMENTATION

All documentation is in the workspace root:

| File | Purpose | Read Time |
|------|---------|-----------|
| **D2D_INDEX.md** | Navigation guide | 5 min |
| **D2D_QUICK_REFERENCE.md** | Developer cheat sheet | 15 min |
| **D2D_IMPLEMENTATION_SUMMARY.md** | Implementation guide | 1 hour |
| **D2D_DESIGN_DOCUMENT.md** | Complete design | 2 hours |
| **D2D_FINAL_CHECKLIST.md** | Implementation checklist | 30 min to skim, 2 hours to complete |
| **D2D_DELIVERY_SUMMARY.txt** | Executive summary | 5 min |

**Total Documentation**: 2200+ lines across 6 files

---

## 🗄️ DATABASE

### New Table: `d2d_diagrams`

The 13th table in SchemaLens:

```sql
CREATE TABLE d2d_diagrams (
    id INT PRIMARY KEY,
    user_id INT FK → users(id) CASCADE,
    diagram_uid VARCHAR(50) UNIQUE,
    diagram_type VARCHAR(50),  -- 'er', 'class', 'usecase', etc.
    input_type VARCHAR(20),    -- 'image', 'document', 'text'
    mermaid_syntax TEXT,       -- Generated Mermaid code
    generated_sql TEXT,        -- Optional for ER/Schema
    recommended_type VARCHAR(50),
    user_selected_type VARCHAR(50),
    status VARCHAR(20),
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

**Migration**: Run `python database/migrate_d2d_tables.py`

---

## 🔌 API ENDPOINTS

All endpoints Premium gated (HTTP 402 if not Pro) and rate limited (100/hour):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/d2d/analyze-image` | Analyze image, recommend diagram type |
| POST | `/api/d2d/analyze-document` | Analyze document, recommend types |
| POST | `/api/d2d/analyze-text` | Analyze text, recommend types |
| POST | `/api/d2d/generate` | Generate Mermaid diagram |
| GET | `/api/d2d/diagrams/{user_id}` | Fetch user's diagram history |
| DELETE | `/api/d2d/diagram/{diagram_uid}` | Delete diagram |

All requests/responses are JSON.

---

## 🤖 MISTRAL AI INTEGRATION

14 prompts total:

**4 Analyzer Prompts**:
- Image Analyzer (extract entities, relationships from image)
- Document Analyzer (extract text from PDF/DOCX/TXT)
- Text Analyzer (analyze user description)

**10 Generator Prompts** (one per diagram type):
- ER Diagram, Class Diagram, Use Case, Flowchart, DFD, Sequence, Activity, Architecture, Component, Schema

All prompts return structured JSON output.

---

## 🎨 FRONTEND COMPONENTS

5 new components:

| Component | Purpose |
|-----------|---------|
| **D2DPage.tsx** | Main D2D page with layout |
| **D2DInputCards.tsx** | 3 input cards (image, doc, text) |
| **D2DAnalysisResult.tsx** | Display analysis & recommendations |
| **D2DMermaidEditor.tsx** | Diagram preview + code editor |
| **D2DHistory.tsx** | Saved diagrams list |

Plus:
- 6 API proxy routes (`/api/d2d/*`)
- Zustand state management (D2DSlice)
- Navigation integration (Sidebar, Navbar)

---

## 🔐 SECURITY

✅ **Premium Gating**: Backend enforced (HTTP 402 if not Pro)

✅ **File Validation**: 
- Image: PNG, JPG, JPEG, WEBP (max 10MB)
- Document: PDF, DOCX, TXT (max 10MB)
- Text: max 5000 chars

✅ **User Isolation**: Users can only access their own diagrams

✅ **API Key Protection**: Mistral key server-side only (never exposed)

✅ **Rate Limiting**: 100 D2D requests per hour per user

✅ **XSS Prevention**: Sanitize all user input in Mistral prompts

✅ **GDPR Compliance**: Cascade delete on user removal

---

## ✅ NO BREAKING CHANGES

D2D:
- ✅ Reuses existing Mistral API setup
- ✅ Reuses existing authentication system
- ✅ Reuses existing payment/subscription system
- ✅ Reuses existing database connection
- ✅ Reuses existing file upload mechanism
- ✅ Reuses existing Zustand state management pattern

Existing features remain **100% unaffected**:
- ✅ Quick Convert (still works)
- ✅ Generate page (still works)
- ✅ Migrate tool (still works)
- ✅ Authentication (still works)
- ✅ Payment system (still works)
- ✅ All existing UI (unmodified)

---

## 🧪 TESTING

**170+ test cases** organized by category:

- Unit tests (backend validation, Mistral calls)
- Integration tests (end-to-end flows)
- Frontend tests (component rendering, interactions)
- Performance tests (response times, load testing)
- Security tests (premium gating, file validation, rate limiting)
- Compatibility tests (existing features not broken)

See **D2D_FINAL_CHECKLIST.md** for complete testing checklist.

---

## 📊 ENVIRONMENT VARIABLES

6 new optional environment variables (all have sensible defaults):

```bash
D2D_MAX_IMAGE_SIZE_MB=10                # Default: 10
D2D_MAX_DOCUMENT_SIZE_MB=10             # Default: 10
D2D_MAX_TEXT_LENGTH=5000                # Default: 5000
D2D_PROCESSING_TIMEOUT_SEC=120          # Default: 120
D2D_ENABLE_FEATURE=true                 # Default: true
D2D_RATE_LIMIT_PER_HOUR=100             # Default: 100
```

---

## 📈 IMPLEMENTATION TIMELINE

**8 days total** for 2-3 developers:

### Phase 1: Backend (Days 1-2)
- Database migration
- SQLAlchemy models
- API endpoints
- Mistral integration
- Unit tests

### Phase 2: Frontend (Days 3-4)
- D2D page component
- Input cards component
- Analysis display component
- Diagram editor component
- History component
- Navigation integration

### Phase 3: Integration (Days 5-6)
- Connect frontend to backend
- State management
- Integration tests
- Premium gating verification
- Security testing

### Phase 4: Polish & Deploy (Days 7-8)
- UI/UX refinements
- Performance optimization
- Security audit
- Staging deployment
- Production deployment

---

## 🚀 DEPLOYMENT

### Pre-Deployment
- Code review
- All tests passing
- Security audit
- Database migration tested on staging

### Production Deployment
1. Create database backup
2. Run migration: `python database/migrate_d2d_tables.py`
3. Verify table and indexes created
4. Deploy backend code
5. Deploy frontend code
6. Update `.env` with D2D settings
7. Restart backend services
8. Run smoke tests on production

### Post-Deployment
- Monitor error logs (24 hours)
- Monitor Mistral API usage
- Monitor D2D feature usage
- Announce feature to users

---

## 📋 FILES TO CREATE/MODIFY

### Created (3 files):
- ✅ `database/migrate_d2d_tables.py`
- ✅ `routes/d2d.py`
- ✅ `models.py` (added D2DDiagram)

### To Create (11 files):
- ⏳ `frontend/components/pages/D2DPage.tsx`
- ⏳ `frontend/components/D2DInputCards.tsx`
- ⏳ `frontend/components/D2DAnalysisResult.tsx`
- ⏳ `frontend/components/D2DMermaidEditor.tsx`
- ⏳ `frontend/components/D2DHistory.tsx`
- ⏳ `frontend/app/api/d2d/analyze-image/route.ts`
- ⏳ `frontend/app/api/d2d/analyze-document/route.ts`
- ⏳ `frontend/app/api/d2d/analyze-text/route.ts`
- ⏳ `frontend/app/api/d2d/generate/route.ts`
- ⏳ `frontend/app/api/d2d/upload-document/route.ts`
- ⏳ `frontend/app/api/d2d/export/route.ts`

### To Modify (7 files):
- ⏳ `app.py` (import D2D router)
- ⏳ `frontend/lib/store.ts` (add D2DSlice)
- ⏳ `frontend/components/layout/Sidebar.tsx` (add D2D link)
- ⏳ `frontend/components/layout/Navbar.tsx` (add D2D link)
- ⏳ `frontend/lib/subscription.ts` (track D2D usage)
- ⏳ `frontend/app/layout.tsx` (if needed)
- ⏳ `.env.example` (add D2D vars)

---

## 💡 QUICK REFERENCE

### Request Example
```bash
curl -X POST http://localhost:8000/api/d2d/analyze-text \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 123,
    "text": "The system has users and orders. Users can create orders. Each order has items."
  }'
```

### Response Example
```json
{
  "diagram_uid": "550e8400-e29b-41d4-a716-446655440000",
  "recommended_types": ["er", "usecase"],
  "confidence": "high",
  "reason": "Detected entities (users, orders, items) and relationships suitable for ER or use case diagram"
}
```

---

## 🎯 SUCCESS METRICS

**Adoption**: 30%+ of Pro users try D2D in first month

**Performance**: 
- Image analysis < 30s
- Document analysis < 30s
- Diagram generation < 10s

**Quality**: 
- Error rate < 1%
- No data loss

**Business**: 
- Free→Pro conversion uplift
- Positive ROI (feature usage vs Mistral costs)

---

## 📞 NEED HELP?

| Question | Answer |
|----------|--------|
| Where's the database schema? | D2D_QUICK_REFERENCE.md → Database section |
| What are the API endpoints? | D2D_QUICK_REFERENCE.md → API Endpoints section |
| How's premium gating implemented? | D2D_DESIGN_DOCUMENT.md → Section 7 |
| What's the testing plan? | D2D_FINAL_CHECKLIST.md → Testing section (90+ items) |
| How do I deploy? | D2D_FINAL_CHECKLIST.md → Deployment section |
| What's the implementation timeline? | D2D_IMPLEMENTATION_SUMMARY.md → Section 13 |
| Which files do I need to create? | D2D_FINAL_CHECKLIST.md → Deliverables section |

---

## ✅ VERIFICATION CHECKLIST

Before starting implementation:

- [ ] Read D2D_QUICK_REFERENCE.md
- [ ] Review D2D_DESIGN_DOCUMENT.md
- [ ] Check database migration script exists
- [ ] Check backend code (routes/d2d.py) exists
- [ ] Understand API endpoints (6 total)
- [ ] Understand frontend components (5 new + 6 routes)
- [ ] Review testing checklist (170+ items)
- [ ] Understand premium gating
- [ ] Confirm no breaking changes to existing features
- [ ] Ready to start Phase 1: Backend implementation

---

## 🎉 READY TO START?

1. ✅ Read this file (README_D2D_FEATURE.md)
2. ✅ Read D2D_QUICK_REFERENCE.md (15 min)
3. ✅ Read D2D_IMPLEMENTATION_SUMMARY.md (1 hour)
4. ✅ Use D2D_FINAL_CHECKLIST.md to create tasks
5. 🚀 Start Phase 1: Backend implementation

---

## 📜 LICENSE & NOTES

This D2D feature design is part of the SchemaLens project.

**Status**: ✅ Design Complete  
**Date**: September 21, 2026  
**Version**: 1.0  

---

**🚀 Ready for implementation!**

For detailed information, see:
- 📖 D2D_INDEX.md (navigation guide)
- 📋 D2D_DESIGN_DOCUMENT.md (complete design)
- 📝 D2D_IMPLEMENTATION_SUMMARY.md (implementation guide)
- ✅ D2D_FINAL_CHECKLIST.md (tracking checklist)
- 🚀 D2D_QUICK_REFERENCE.md (quick reference)

Good luck! 🎉
