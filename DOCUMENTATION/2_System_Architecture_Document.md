# System Architecture Document
## SchemaLens - AI-Powered Database Schema Toolkit

**Version:** 1.0  
**Date:** September 2026  
**Architect:** Design Team  

---

## 1. Architecture Overview

SchemaLens follows a **three-tier client-server architecture** with separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│           Next.js Frontend (React Components)                │
│  - Browser-based client application                          │
│  - TypeScript type safety                                    │
│  - Tailwind CSS styling                                      │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API / HTTP
┌────────────────────▼────────────────────────────────────────┐
│                   BUSINESS LOGIC LAYER                       │
│         FastAPI Backend (Python/Starlette)                   │
│  - RESTful API endpoints                                     │
│  - Authentication & Authorization                            │
│  - Business logic processing                                 │
└────────────────────┬────────────────────────────────────────┘
                     │ Database Queries / External APIs
┌────────────────────▼─────────────────────────────────────────┐
│                    DATA & SERVICES LAYER                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PostgreSQL  │  │  Mistral AI  │  │  Razorpay   │      │
│  │   Database   │  │     LLM      │  │  Payment    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

### Frontend
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript | Type safety and developer experience |
| **Framework** | Next.js 15.5.20 | React-based full-stack framework |
| **UI Library** | React 19 | Component-based UI development |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **Animation** | Framer Motion | Smooth page transitions |
| **State** | Zustand | Lightweight state management |
| **HTTP Client** | Fetch API | Native REST communication |
| **Query** | React Query | Server state management |
| **Authentication** | Google OAuth | Social login integration |

### Backend
| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | Python 3.14 | Server-side scripting |
| **Framework** | FastAPI | Modern async web framework |
| **ORM** | SQLAlchemy | Database abstraction |
| **Database** | PostgreSQL 15+ | Relational database |
| **Authentication** | bcrypt | Password hashing |
| **Email** | SMTP/Gmail | OTP and notifications |
| **Task Queue** | Background Tasks | Async operations |
| **AI Service** | Mistral AI API | Image and text analysis |
| **Payments** | Razorpay API | Payment processing |

### Infrastructure
| Component | Service | Purpose |
|-----------|---------|---------|
| **Database** | Neon PostgreSQL | Cloud-hosted DB with SSL |
| **Hosting** | Local/Cloud Ready | Uvicorn + Next.js Server |
| **API Gateway** | CORS Middleware | Cross-origin request handling |
| **Cache** | In-memory (Python) | Session and request caching |

---

## 3. Detailed Component Architecture

### 3.1 Frontend Architecture

**App Structure:**
```
frontend/
├── app/
│   ├── page.tsx (Root Router)
│   ├── layout.tsx (HTML Shell)
│   ├── globals.css (Tailwind)
│   ├── providers.tsx (Context & OAuth)
│   ├── playground/
│   ├── api/
│   │   ├── analyze/ (Image → SQL)
│   │   ├── generate/ (Text → Schema)
│   │   ├── migrate/ (SQL Conversion)
│   │   └── razorpay/
│   │       ├── create-order/
│   │       └── verify-payment/
│   └── [404]
├── components/
│   ├── auth/ (Login, Register, etc.)
│   ├── pages/ (Dashboard, Projects, etc.)
│   ├── layout/ (Sidebar, Navbar, etc.)
│   └── ambient/ (3D Database Scene)
├── lib/
│   ├── api.ts (HTTP Requests)
│   ├── auth.ts (Authentication Logic)
│   ├── store.ts (Zustand State)
│   ├── types.ts (TypeScript Definitions)
│   └── customization.ts (Column Injection)
└── public/ (Static Assets)
```

**Key Design Patterns:**
- **Next.js App Router:** File-based routing
- **Server Components:** Backend rendering where possible
- **Client Components:** `"use client"` for interactivity
- **API Routes:** `/app/api/*` for backend endpoints
- **Zustand Store:** Global state (user, projects, settings)
- **React Query:** Server state synchronization

### 3.2 Backend Architecture

**App Structure:**
```
backend/
├── app.py (Main FastAPI application)
├── models.py (SQLAlchemy ORM models)
├── database.py (Database connection)
├── config.py (Configuration)
├── auth.py (Authentication routes)
├── utils/
│   ├── activity_logger.py
│   ├── file_storage.py
│   ├── email_service.py
│   └── rate_limiter.py
├── database/
│   ├── schema.sql
│   ├── init_db.py
│   └── migrations/
└── uploads/ (User uploaded files)
```

**API Endpoint Structure:**
```
Authentication:
  POST /register
  POST /login
  POST /auth/google
  POST /forgot-password/send-otp
  POST /forgot-password/verify-otp
  POST /forgot-password/reset

User Management:
  GET /user/{user_id}
  PUT /user/{user_id}/profile
  PUT /user/{user_id}/password
  POST /user/{user_id}/set-password
  DELETE /user/{user_id}

Projects:
  POST /projects
  GET /projects/{user_id}
  DELETE /projects/{user_id}/{project_uid}

Image Processing:
  POST /upload-image
  GET /project-images/{project_id}

Conversions:
  POST /save-conversion
  GET /conversions/{user_id}

Payments:
  POST /razorpay/create-order
  POST /razorpay/verify-payment

Admin:
  GET /admin/users
  GET /admin/stats
  PUT /admin/users/{user_id}/suspend
  PUT /admin/users/{user_id}/plan
  PUT /admin/users/{user_id}/role
```

---

## 4. Data Flow Architecture

### 4.1 ER Diagram to SQL Flow

```
User Interface
    │
    ├─ Upload Image File (.png, .jpg, etc.)
    │
    ▼
Frontend Upload Handler
    │
    ├─ Validate file type & size
    ├─ Encode to Base64
    ├─ Select target dialect
    │
    ▼
POST /api/analyze (Next.js Route)
    │
    ├─ Check Mistral API Key
    ├─ Build dialect-specific prompt
    ├─ Send Base64 image to Mistral
    │
    ▼
Mistral AI LLM
    │
    ├─ Visual extraction (entities, attributes)
    ├─ Relationship analysis
    ├─ PK/FK identification
    │
    ▼
POST /api/analyze Response
    │
    ├─ Receive SQL DDL
    ├─ Parse response
    ├─ Display in UI
    ├─ Store in conversion history
    │
    ▼
User Reviews & Exports SQL
```

### 4.2 Project File Storage Flow

```
Create Project
    │
    ├─ Generate project_uid
    ├─ Save to projects table
    │
    ▼
Upload Images to Project
    │
    ├─ Associate with project_uid
    ├─ Encode image as Base64 data URL
    ├─ Save to project_images table
    ├─ image_data column stores complete Base64
    │
    ▼
Image Persistence
    │
    ├─ Base64 survives page reloads
    ├─ Available across sessions
    ├─ Accessible from frontend state
    │
    ▼
Generate SQL from Image
    │
    ├─ Retrieve Base64 from database
    ├─ Send to Mistral AI
    ├─ Store generated_sql in project_images
    │
    ▼
Export Project
    │
    ├─ Retrieve all files
    ├─ Package as .zip or export format
    └─ Download to user device
```

### 4.3 Payment Processing Flow

```
User Views Pricing → Clicks "Upgrade"
    │
    ▼
Frontend: POST /api/razorpay/create-order
    │
    ├─ Amount in paise (100 paise = ₹1)
    ├─ Plan type (pro_monthly, etc.)
    │
    ▼
Backend: Create Razorpay Order
    │
    ├─ Call Razorpay API
    ├─ Receive order_id
    ├─ Save order to payments table
    ├─ Return order_id to frontend
    │
    ▼
Frontend: Open Razorpay Checkout Modal
    │
    ├─ User enters payment details
    ├─ User authorizes payment
    │
    ▼
Razorpay: Process Payment
    │
    ├─ Charge card/wallet
    ├─ Generate payment_id
    ├─ Return signature
    │
    ▼
Frontend: POST /api/razorpay/verify-payment
    │
    ├─ Send payment_id, order_id, signature
    │
    ▼
Backend: Verify Signature (HMAC-SHA256)
    │
    ├─ Validate signature correctness
    ├─ Update payment status to 'paid'
    ├─ Upgrade user plan to 'pro'
    ├─ Update conversions_used_this_month to 0
    │
    ▼
Return Success to Frontend
    │
    ├─ Display confirmation message
    ├─ Update user subscription in state
    ├─ Redirect to dashboard
```

---

## 5. Database Architecture

### 5.1 Entity Relationship Diagram

```
┌──────────────┐
│    users     │◄─────┐
├──────────────┤      │
│ id (PK)      │      │
│ email (UK)   │      │
│ password_hash│      │
│ role         │      │
│ plan         │      │
│ google_id(UK)├──────┼───────┐
└──────────────┘      │       │
       │              │       │
       │ (1:N)        │       │
       ├─────────┐    │       │
       │         │    │       │
       ▼         ▼    ▼       ▼
   ┌─images─┐ ┌─conversions─┐ ┌─projects─┐
   └────────┘ └─────────────┘ └──────────┘
       │             │              │
       │ (1:N)       │ (1:N)        │ (1:N)
       │             │              │
       ▼             ▼              ▼
┌─conversions┐  ┌─export_logs─┐ ┌─project_images─┐
└─────────────┘  └──────────────┘ └─────────────────┘

┌──────────────────────────────────────┐
│      Relationships (All FK → users)  │
├──────────────────────────────────────┤
│ images.user_id → users.id            │
│ conversions.user_id → users.id       │
│ projects.user_id → users.id          │
│ user_activity.user_id → users.id     │
│ payments.user_id → users.id          │
│ api_usage.user_id → users.id         │
│ export_logs.user_id → users.id       │
│ quick_history.user_id → users.id     │
│ project_images.user_id → users.id    │
└──────────────────────────────────────┘
```

### 5.2 Table Specifications

**Core Tables (12 total):**
1. `users` - User accounts and authentication
2. `images` - Uploaded ER diagram files
3. `conversions` - Generated SQL conversions
4. `user_activity` - Audit trail
5. `payments` - Payment records (Razorpay)
6. `api_usage` - AI API calls tracking
7. `export_logs` - Download/export activity
8. `projects` - User workspaces
9. `quick_history` - Non-project conversion history
10. `tool_history` - Cross-tool usage analytics
11. `password_reset_otps` - OTP records
12. `project_images` - Images within projects

---

## 6. Security Architecture

### 6.1 Authentication Flow

```
User Login Attempt
    │
    ├─ (1) Extract email & password
    ├─ (2) Rate limit check (3 attempts/min)
    │
    ▼
Database Lookup
    │
    ├─ Query users table by email
    ├─ If not found → record failed attempt
    │
    ▼
Password Verification
    │
    ├─ Use bcrypt.checkpw()
    ├─ Compare provided password hash
    ├─ If mismatch → record failed attempt + lock
    │
    ▼
Account Status Check
    │
    ├─ Verify is_active = true
    ├─ Check email_verified (if required)
    │
    ▼
Generate Session Token
    │
    ├─ Create JWT-like token with user ID
    ├─ Store token in localStorage
    ├─ Update last_login timestamp
    │
    ▼
Redirect to Dashboard
```

### 6.2 API Security

```
All API Requests
    │
    ├─ CORS: Whitelist origins
    ├─ Rate Limit: 100 req/min per user
    ├─ Input Validation: Sanitize inputs
    │
    ▼
Authentication Check
    │
    ├─ Verify token exists in headers
    ├─ Validate token integrity
    ├─ Extract user_id from token
    │
    ▼
Authorization Check
    │
    ├─ Verify user owns resource
    ├─ Check role permissions (admin routes)
    ├─ Validate request parameters
    │
    ▼
Process Request
    │
    ├─ Execute business logic
    ├─ Log activity
    ├─ Return response
```

### 6.3 Data Protection

- **At Rest:** SSL/TLS for database connections
- **In Transit:** HTTPS for all API calls
- **Passwords:** bcrypt hashing (salted)
- **OTP:** 6-digit codes, 10-minute expiry
- **Tokens:** Secure HTTP-only cookies (where applicable)
- **Sensitive Data:** Masked in logs

---

## 7. Scalability & Performance

### 7.1 Horizontal Scaling

```
Load Balancer (Nginx/HAProxy)
    │
    ├─ API Server 1 (Uvicorn)
    ├─ API Server 2 (Uvicorn)
    ├─ API Server 3 (Uvicorn)
    └─ API Server N (Uvicorn)
         │
         ├─ Shared PostgreSQL (Neon)
         ├─ Redis Cache (Optional)
         └─ Mistral AI (External)
```

### 7.2 Performance Optimizations

1. **Database:** Indexing on frequently queried columns (email, user_id, timestamps)
2. **Caching:** Session data in Redis
3. **CDN:** Static assets served via CDN
4. **API Response:** Pagination for large result sets
5. **Frontend:** Code splitting and lazy loading
6. **Image Processing:** Async task queue for heavy operations

---

## 8. Deployment Architecture

### 8.1 Development Environment
```
Local Machine
├── Frontend: npm run dev (http://localhost:3000)
├── Backend: uvicorn app:app --reload (http://localhost:8000)
└── Database: PostgreSQL local or Neon dev database
```

### 8.2 Production Environment
```
Production Server
├── Frontend: Next.js Static Export / Server (Port 3000)
├── Backend: Uvicorn with Gunicorn (Port 8000)
├── Database: Neon PostgreSQL (Cloud)
├── HTTPS: SSL Certificate (Let's Encrypt)
└── Monitoring: Application logs & metrics
```

---

## 9. Error Handling & Logging

### 9.1 Error Hierarchy

```
Request
  │
  ├─ 400 Bad Request: Invalid input
  ├─ 401 Unauthorized: Missing/invalid token
  ├─ 403 Forbidden: Insufficient permissions
  ├─ 404 Not Found: Resource doesn't exist
  ├─ 409 Conflict: Resource conflict (duplicate email)
  ├─ 429 Rate Limited: Too many requests
  ├─ 500 Server Error: Unexpected error
  └─ 503 Service Unavailable: External service down
```

### 9.2 Logging Strategy

**Levels:**
- INFO: Normal operations (login, upload, conversion)
- WARNING: Unexpected but handled (rate limit, invalid input)
- ERROR: Serious issues (database errors, API failures)
- CRITICAL: System failures (database down, API down)

**What's Logged:**
- User actions (login, uploads, downloads)
- API calls and response times
- AI processing results
- Payment transactions
- Errors and exceptions
- Rate limit violations

---

## 10. Disaster Recovery

### 10.0 Backup Strategy
- Daily incremental backups
- Weekly full backups
- Monthly archival backups
- RTO: 4 hours
- RPO: 1 hour

### 10.1 Business Continuity

1. **Database Failover:** Automatic via Neon replication
2. **API Recovery:** Health checks and restart policies
3. **Data Recovery:** Point-in-time restore capability
4. **Communication:** Status page for incidents

---

**Document End**
