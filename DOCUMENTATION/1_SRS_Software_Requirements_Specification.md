# Software Requirements Specification (SRS)
## SchemaLens - AI-Powered Database Schema Toolkit

**Document Version:** 1.0  
**Date:** September 2026  
**Status:** Production  
**Project:** SchemaLens  

---

## 1. Executive Summary

SchemaLens is a comprehensive SaaS platform that leverages artificial intelligence to convert Entity-Relationship (ER) diagrams into executable SQL Database Definition Language (DDL) scripts. The platform supports five major database dialects and provides intelligent schema generation, migration, and management capabilities.

---

## 2. Purpose & Scope

### Purpose
To provide a unified, AI-powered solution for database professionals to:
- Convert visual ER diagrams to DDL scripts across multiple database dialects
- Generate database schemas from natural language descriptions
- Migrate SQL between different database systems
- Manage database projects collaboratively
- Track usage and maintain subscription-based access

### Scope
- **In Scope:**
  - User authentication (email/password, Google OAuth)
  - ER diagram image processing and AI analysis
  - Multi-dialect SQL generation (PostgreSQL, MySQL, SQLite, SQL Server, Oracle)
  - Project workspace management
  - Payment processing and subscription management
  - Admin dashboard with user controls
  - Password reset via OTP
  - Mobile-responsive interface

- **Out of Scope:**
  - Database hosting or direct database connections
  - Real-time collaboration features
  - Version control integration
  - CI/CD pipeline management

---

## 3. Functional Requirements

### 3.1 User Management
| ID | Requirement | Description |
|---|---|---|
| FR-1.1 | User Registration | Users can register with email, full name, and password (min 6 characters) |
| FR-1.2 | Email/Password Login | Secure login with bcrypt hashing and rate limiting (3 attempts/min) |
| FR-1.3 | Google OAuth Login | Single sign-on via Google with automatic account creation |
| FR-1.4 | Password Reset | OTP-based password reset via email (10-minute expiry) |
| FR-1.5 | Profile Management | Update full name and avatar picture |
| FR-1.6 | Account Deactivation | Users can deactivate their own accounts (soft delete) |
| FR-1.7 | Role-Based Access | User and Admin roles with appropriate permissions |
| FR-1.8 | Session Management | JWT-like token system with persistent authentication |

### 3.2 ER Diagram Processing (Quick Convert)
| ID | Requirement | Description |
|---|---|---|
| FR-2.1 | Image Upload | Upload ER diagram images (PNG, JPG, JPEG, WEBP) |
| FR-2.2 | AI Analysis | Use Mistral AI to analyze diagram and extract entities/relationships |
| FR-2.3 | Dialect Selection | Choose target database dialect for SQL generation |
| FR-2.4 | Custom Columns | Inject custom columns (e.g., roll_number, created_at, updated_at) |
| FR-2.5 | SQL Generation | Generate executable DDL scripts from diagram |
| FR-2.6 | Error Handling | Graceful handling of invalid/unclear diagrams |
| FR-2.7 | Processing History | Store conversion history with timestamps |

### 3.3 Schema Generation (Generate)
| ID | Requirement | Description |
|---|---|---|
| FR-3.1 | Text Input | Accept natural language description of database |
| FR-3.2 | Mermaid Diagram | Generate visual Mermaid ER diagram from text |
| FR-3.3 | SQL Generation | Create DDL from generated diagram |
| FR-3.4 | Multiple Diagram Types | Support ER diagrams, flowcharts, DFD, class diagrams |
| FR-3.5 | Dialect Output | Generate SQL in selected database dialect |
| FR-3.6 | Customization | Apply custom columns and rules to generation |

### 3.4 SQL Migration (Migrate)
| ID | Requirement | Description |
|---|---|---|
| FR-4.1 | SQL Input | Accept SQL scripts from source database |
| FR-4.2 | Dialect Detection | Automatically detect source dialect |
| FR-4.3 | Syntax Conversion | Transform syntax to target dialect |
| FR-4.4 | Target Selection | Choose target database system |
| FR-4.5 | Migration Output | Generate optimized SQL for target system |

### 3.5 Project Management
| ID | Requirement | Description |
|---|---|---|
| FR-5.1 | Create Projects | Users can create named project workspaces |
| FR-5.2 | Project Storage | Store project metadata and associated files |
| FR-5.3 | Image Organization | Upload and organize ER diagrams within projects |
| FR-5.4 | File Management | Save and retrieve SQL files within projects |
| FR-5.5 | Project Deletion | Delete projects and associated data |
| FR-5.6 | Project Pinning | Pin frequently used projects |

### 3.6 Payment & Subscription
| ID | Requirement | Description |
|---|---|---|
| FR-6.1 | Free Plan | Limited monthly conversions (included) |
| FR-6.2 | Pro Plan | Unlimited conversions with priority support |
| FR-6.3 | Razorpay Integration | Secure payment processing with INR support |
| FR-6.4 | Order Management | Create and verify payment orders |
| FR-6.5 | Plan Upgrade | Automatic plan upgrade on successful payment |
| FR-6.6 | Usage Tracking | Real-time conversion usage monitoring |
| FR-6.7 | Billing History | View past payments and invoices |

### 3.7 Admin Dashboard
| ID | Requirement | Description |
|---|---|---|
| FR-7.1 | User List | Display all users with filtering and pagination |
| FR-7.2 | User Suspension | Admin can suspend/unsuspend user accounts |
| FR-7.3 | Plan Management | Change user plans (free ↔ pro) |
| FR-7.4 | Role Assignment | Assign admin/user roles |
| FR-7.5 | Conversion Reset | Reset monthly conversion limits |
| FR-7.6 | Admin Statistics | Dashboard with key metrics and analytics |
| FR-7.7 | Activity Logs | View comprehensive user activity records |

### 3.8 Export & Download
| ID | Requirement | Description |
|---|---|---|
| FR-8.1 | SQL Export | Download generated SQL as .sql file |
| FR-8.2 | Text Export | Export SQL as plain text |
| FR-8.3 | JSON Export | Export as structured JSON format |
| FR-8.4 | Copy to Clipboard | Quick copy to clipboard functionality |
| FR-8.5 | Export Tracking | Log all export activities |

---

## 4. Non-Functional Requirements

### 4.1 Performance
| ID | Requirement | Target |
|---|---|---|
| NFR-1.1 | API Response Time | < 500ms for standard requests |
| NFR-1.2 | Image Processing | < 30 seconds for typical ER diagrams |
| NFR-1.3 | Database Queries | < 200ms for typical queries |
| NFR-1.4 | Page Load | < 2 seconds on 4G networks |
| NFR-1.5 | Concurrent Users | Support 1000+ simultaneous users |

### 4.2 Security
| ID | Requirement | Implementation |
|---|---|---|
| NFR-2.1 | Data Encryption | SSL/TLS for all connections |
| NFR-2.2 | Password Security | bcrypt hashing with salt |
| NFR-2.3 | Rate Limiting | Protect against brute force attacks |
| NFR-2.4 | SQL Injection Prevention | SQLAlchemy ORM prevents injection |
| NFR-2.5 | XSS Prevention | React built-in escaping |
| NFR-2.6 | CSRF Protection | Token-based request verification |
| NFR-2.7 | API Authentication | JWT-like tokens for all requests |

### 4.3 Availability & Reliability
| ID | Requirement | Target |
|---|---|---|
| NFR-3.1 | Uptime SLA | 99.5% availability |
| NFR-3.2 | Backup Schedule | Daily incremental, weekly full backup |
| NFR-3.3 | Disaster Recovery | RTO: 4 hours, RPO: 1 hour |
| NFR-3.4 | Error Logging | Comprehensive error tracking |
| NFR-3.5 | Monitoring | Real-time system health monitoring |

### 4.4 Scalability
| ID | Requirement | Implementation |
|---|---|---|
| NFR-4.1 | Horizontal Scaling | Stateless API architecture |
| NFR-4.2 | Database Scaling | Read replicas for reporting |
| NFR-4.3 | Caching | Redis for session and query caching |
| NFR-4.4 | CDN Integration | Static assets via CDN |

### 4.5 Usability
| ID | Requirement | Implementation |
|---|---|---|
| NFR-5.1 | Mobile Responsive | Full functionality on mobile devices |
| NFR-5.2 | Dark/Light Theme | User preference persistence |
| NFR-5.3 | Accessibility | WCAG 2.1 AA compliance target |
| NFR-5.4 | Internationalization | Support for multiple languages |

### 4.6 Maintainability
| ID | Requirement | Implementation |
|---|---|---|
| NFR-6.1 | Code Documentation | Comprehensive inline and external docs |
| NFR-6.2 | Error Messages | Clear, actionable error messages |
| NFR-6.3 | Logging | Structured logging for debugging |
| NFR-6.4 | API Versioning | Versioned API endpoints |

---

## 5. System Overview

### 5.1 Architecture
```
┌─────────────────────────────────────────────────────┐
│              Frontend (Next.js/React)               │
│         Mobile Responsive UI - Tailwind CSS          │
└──────────────┬──────────────────────────────────────┘
               │ HTTP/REST API
┌──────────────▼──────────────────────────────────────┐
│            Backend (FastAPI/Python)                 │
│      40+ REST Endpoints - CORS Enabled              │
└──────────────┬──────────────────────────────────────┘
               │ 
       ┌───────┴────────┬──────────────┐
       │                │              │
   ┌───▼────┐    ┌─────▼────┐   ┌────▼─────┐
   │Database│    │Mistral AI│   │Razorpay  │
   │PostgreSQL   │LLM       │   │Payments  │
   │(Neon)  │    │API       │   └──────────┘
   └────────┘    └──────────┘
```

### 5.2 Component Breakdown

**Frontend Components:**
- Authentication pages (Login, Register, Reset)
- Main dashboard with 3D visualization
- Project management interface
- Quick Convert (image upload)
- Generate (text-to-schema)
- Migrate (SQL conversion)
- Admin dashboard
- Settings, Profile, Pricing pages

**Backend Modules:**
- Authentication & Authorization
- Image processing & storage
- AI processing (Mistral integration)
- Project management
- Payment processing
- Admin controls
- Activity logging

**External Services:**
- Mistral AI for image & text analysis
- Razorpay for payment processing
- Google OAuth for authentication
- SMTP for email delivery
- PostgreSQL database

---

## 6. User Types & Personas

### 6.1 Primary Users

**Database Administrators**
- Need: Quick conversion from ER diagrams to DDL
- Pain Point: Manual SQL writing, dialect differences
- Usage: Heavy (20+ conversions/month)
- Solution: Quick Convert + Migration tools

**Data Architects**
- Need: Schema design, documentation, collaboration
- Pain Point: Communication between teams
- Usage: Moderate (5-10 conversions/month)
- Solution: Project management, diagram generation

**Developers**
- Need: Quick schema setup, multiple database support
- Pain Point: Syntax differences across databases
- Usage: Variable (1-50 conversions/month)
- Solution: All tools, especially Migrate

**System Administrators**
- Need: User management, system monitoring
- Usage: Admin dashboard
- Solution: Admin panel with full controls

---

## 7. Use Cases

### UC-1: Upload ER Diagram and Generate SQL
**Actor:** Database Administrator  
**Precondition:** User is logged in, has conversions available  
**Flow:**
1. User navigates to Quick Convert
2. Uploads ER diagram image
3. Selects target database dialect
4. Optionally customizes columns
5. System processes image via Mistral AI
6. Displays generated SQL
7. User downloads or copies SQL

### UC-2: Create Project and Manage Files
**Actor:** Data Architect  
**Precondition:** User is logged in  
**Flow:**
1. User creates new project
2. Uploads multiple ER diagrams
3. Generates SQL from each diagram
4. Saves SQL files to project
5. Returns to project and modifies files
6. Exports entire project

### UC-3: Migrate SQL Between Databases
**Actor:** Developer  
**Precondition:** User has SQL script, logged in  
**Flow:**
1. Navigate to Migrate tool
2. Paste or upload SQL script
3. Select source database type
4. Choose target database
5. Review converted SQL
6. Download migrated script

### UC-4: Reset Forgotten Password
**Actor:** Any User  
**Precondition:** User has account but forgot password  
**Flow:**
1. Click "Forgot Password" on login
2. Enter email address
3. System sends OTP via email
4. User enters OTP
5. User sets new password
6. Redirected to login

### UC-5: Upgrade to Pro Plan
**Actor:** User  
**Precondition:** User on free plan, wants unlimited conversions  
**Flow:**
1. Navigate to Pricing page
2. Click "Upgrade to Pro"
3. Enter payment details
4. Complete Razorpay payment
5. Plan automatically upgraded
6. Conversion limits removed

---

## 8. Constraints & Assumptions

### Constraints
- Image processing limited to 5MB files
- Maximum 100 projects per user
- API rate limit: 100 requests/minute per user
- Supported image formats: PNG, JPG, JPEG, WEBP
- Database: PostgreSQL only (backend)
- Supported languages: English (initially)

### Assumptions
- Users have stable internet connection
- Mistral AI API remains available
- Razorpay payment gateway operational
- SMTP server configured for email delivery
- Users have modern browsers (Chrome, Firefox, Safari, Edge)

---

## 9. Future Enhancements

### Phase 2 (Q1 2027)
- Real-time collaboration on projects
- SQL query builder interface
- Database connection & direct schema import
- Advanced analytics dashboard

### Phase 3 (Q2 2027)
- Version control for schema evolution
- CI/CD pipeline integration
- API documentation generator
- Database comparison tool

### Phase 4 (Q3 2027)
- Mobile native apps
- Offline mode support
- AI-powered optimization suggestions
- Machine learning for schema recommendations

---

## 10. Success Criteria

- 10,000+ registered users within 6 months
- 95%+ uptime
- Average image processing time < 15 seconds
- 80%+ user retention (monthly)
- Net Promoter Score (NPS) > 50
- 1000+ active pro subscribers
- < 1% error rate on conversions

---

**Document End**
