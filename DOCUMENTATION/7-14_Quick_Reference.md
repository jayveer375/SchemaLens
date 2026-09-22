# Quick Reference - Documents 7-14
## SchemaLens Complete Documentation Bundle

---

## 7. FUNCTIONAL REQUIREMENTS

### Core Features Implemented

**Authentication & User Management**
- Email/password registration with bcrypt hashing
- Google OAuth 2.0 integration
- OTP-based password reset (10-minute expiry)
- Rate-limited login (3 attempts/minute)
- User profile management with avatars
- Account deactivation

**Image Processing & SQL Generation**
- Support: PNG, JPG, JPEG, WEBP images (max 5MB)
- Mistral AI image analysis
- 5-dialect support: PostgreSQL, MySQL, SQLite, SQL Server, Oracle
- Custom column injection (roll_number, created_at, updated_at, etc.)
- Error handling with fallback generation
- Processing time tracking

**Project Management**
- Create/edit/delete user projects
- Project-level image organization
- Base64 image storage (survives page reloads)
- File management within projects
- Project pinning for quick access

**Payment & Subscription**
- Razorpay integration (INR currency)
- Free plan: 25 conversions/month
- Pro plan: Unlimited conversions
- Automatic plan upgrade on payment success
- Monthly usage reset
- Payment history tracking

**Admin Dashboard**
- User list with filtering
- Suspend/unsuspend accounts
- Plan management
- Role assignment
- Conversion limit reset
- System statistics
- Activity logs

**Export & Download**
- SQL file download (.sql)
- Plain text export (.txt)
- JSON format export
- Copy to clipboard
- Export tracking

---

## 8. NON-FUNCTIONAL REQUIREMENTS

### Performance Targets
- API response: < 500ms
- Image processing: < 30 seconds
- Database queries: < 200ms
- Page load: < 2 seconds (4G)
- Concurrent users: 1000+

### Security
- HTTPS/SSL for all connections
- bcrypt password hashing
- SQL injection prevention (ORM)
- XSS prevention (React escaping)
- Rate limiting on authentication
- Audit logging of admin actions
- Data encryption in transit

### Availability & Reliability
- 99.5% uptime SLA
- Daily automated backups
- Disaster recovery: RTO 4 hours, RPO 1 hour
- Error logging and monitoring
- Health checks and auto-restart

### Scalability
- Stateless API (horizontal scaling ready)
- Database connection pooling
- Static asset CDN
- Session caching (Redis-ready)
- Pagination for large datasets

### Usability
- Mobile responsive design
- Dark/light theme toggle
- Accessibility: WCAG 2.1 AA target
- Smooth animations (Framer Motion)
- Intuitive UI components

---

## 9. USE CASES & SYSTEM SCENARIOS

### UC-1: Quick ER Diagram Conversion
**Actor:** Database Administrator
**Steps:**
1. Navigate to Quick Convert
2. Upload ER diagram image
3. Select target database
4. Optionally add custom columns
5. View generated SQL
6. Download or copy SQL

### UC-2: Project-Based Development
**Actor:** Data Architect
**Steps:**
1. Create new project
2. Upload multiple ER diagrams
3. Generate SQL from each
4. Organize and save files
5. Iterate and refine
6. Export final schema

### UC-3: SQL Migration
**Actor:** Developer
**Steps:**
1. Paste/upload SQL script
2. Select source database
3. Choose target database
4. Review converted syntax
5. Download migrated script

### UC-4: Team Collaboration (Future)
**Actor:** Multiple team members
**Planned:** Real-time editing, comments, version history

---

## 10. DATA FLOW DIAGRAMS

### ER Diagram Processing Flow
```
User Upload Image
  ↓
File Validation (size, format)
  ↓
Base64 Encoding
  ↓
Build Dialect-Specific Prompt
  ↓
Mistral AI API Call
  ↓
Image Analysis & DDL Generation
  ↓
Response Parsing
  ↓
Store in Database
  ↓
Display in UI
```

### Payment Processing Flow
```
User Clicks "Upgrade"
  ↓
Create Razorpay Order
  ↓
Open Payment Modal
  ↓
User Authorizes Payment
  ↓
Razorpay Process Payment
  ↓
Frontend Verify Payment
  ↓
Backend Signature Validation
  ↓
Update User Plan to "pro"
  ↓
Reset Conversions Counter
  ↓
Display Success
```

### Project Image Storage Flow
```
Upload Image to Project
  ↓
Encode as Base64 Data URL
  ↓
Save to project_images table
  ↓
Persist Across Sessions
  ↓
Send to Mistral AI
  ↓
Store Generated SQL
  ↓
Display in Project
```

---

## 11. MODULE/FEATURE DOCUMENTATION

### Frontend Modules

**Authentication Module**
- LoginPage, RegisterPage, ForgotPasswordPage, SetPasswordPage
- Location: `frontend/components/auth/`
- Handles: Email/password, Google OAuth, OTP verification
- State: Zustand auth store

**Project Module**
- ProjectsPage, ProjectDetailPage
- Location: `frontend/components/pages/`
- Features: CRUD operations, file management, image upload

**Tools Module**
- QuickConvertPage, GeneratePage, MigratePage
- Location: `frontend/components/pages/`
- API routes: `/api/analyze`, `/api/generate`, `/api/migrate`

**Admin Module**
- AdminPage with user management
- Location: `frontend/components/pages/AdminPage.tsx`
- Restricted: Admin role only

### Backend Modules

**Authentication Module** (`app.py` routes)
- `/register` - User registration
- `/login` - Email/password login
- `/auth/google` - Google OAuth
- `/forgot-password/*` - Password reset flow

**Project Module** (`app.py` routes)
- `/projects` - CRUD operations
- `/project-images/*` - Image management

**Conversion Module** (`app.py` routes)
- `/save-conversion` - Store conversion results
- `/upload-image` - Image upload

**Payment Module** (`app.py` routes)
- `/razorpay/create-order` - Order creation
- `/razorpay/verify-payment` - Payment verification

**Admin Module** (`app.py` routes)
- `/admin/users` - User list
- `/admin/stats` - Statistics
- `/admin/users/{id}/suspend` - User control
- `/admin/users/{id}/plan` - Plan management

---

## 12. INSTALLATION & SETUP GUIDE

### Prerequisites
- Python 3.8+
- Node.js 16+
- PostgreSQL 12+
- Git

### Backend Setup
```bash
# Clone and navigate
git clone <repo>
cd SchemaLens

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Setup database
cd database
python init_db.py

# Start server
python -m uvicorn app:app --reload
```

### Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your values

# Start dev server
npm run dev
```

### Environment Configuration
```
.env (Backend):
  DATABASE_URL=postgresql://user:pass@localhost/schemalens
  MISTRAL_API_KEY=your_key_here
  GOOGLE_CLIENT_ID=your_google_client_id
  SMTP_EMAIL=your_email@gmail.com
  SMTP_PASSWORD=your_app_password

frontend/.env.local (Frontend):
  NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
  MISTRAL_API_KEY=your_key_here
  NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Database Initialization
```bash
# Run migrations
cd database
python init_db.py

# Seed demo data
python seed_demo.py
```

---

## 13. TESTING DOCUMENTATION

### Unit Tests
- Frontend: Jest + React Testing Library
- Backend: pytest + SQLAlchemy test fixtures

### Integration Tests
- API endpoint tests
- Database transaction tests
- Payment flow testing

### E2E Tests
- User registration flow
- Image upload and conversion
- Payment processing
- Admin operations

### Test Coverage Goals
- Backend: > 80%
- Frontend: > 75%
- Critical paths: 100%

### Running Tests
```bash
# Backend tests
pytest tests/ -v

# Frontend tests
npm test

# E2E tests
npm run test:e2e
```

---

## 14. SECURITY DOCUMENTATION

### Authentication Security
- bcrypt hashing (salted)
- JWT-like tokens
- Rate limiting (3 failed attempts/minute)
- Session timeout
- Secure password reset flow

### Data Protection
- HTTPS/SSL enforcement
- Database connection encryption
- Sensitive data masking in logs
- GDPR-compliant data deletion

### API Security
- CORS whitelist
- Input validation & sanitization
- SQL injection prevention (ORM)
- XSS prevention (React escaping)
- Rate limiting (100 req/min per user)

### Payment Security
- PCI DSS compliance (Razorpay handled)
- HMAC-SHA256 signature verification
- Secure order verification
- No card data stored locally

### Infrastructure Security
- Environment variable management
- Secrets not in git (`.env` ignored)
- Cloud database with SSL required
- Monitoring and alerting
- Regular security audits

### Compliance
- GDPR: Data subject rights, consent management
- Terms of Service: User agreement
- Privacy Policy: Data handling practices

---

## DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All tests passing
- [ ] Code review completed
- [ ] Environment variables configured
- [ ] Database backups scheduled
- [ ] SSL certificate valid
- [ ] Rate limiting configured
- [ ] Logging enabled
- [ ] Monitoring set up

### Production Deployment
- [ ] Database migrations applied
- [ ] Backend deployed
- [ ] Frontend built and deployed
- [ ] Health checks passing
- [ ] DNS updated
- [ ] CDN configured
- [ ] Backups verified
- [ ] Monitoring alerts active

### Post-Deployment
- [ ] Smoke tests passed
- [ ] User acceptance testing
- [ ] Performance monitored
- [ ] Error rates normal
- [ ] Support documentation updated
- [ ] Release notes published

---

## SUPPORT & MAINTENANCE

### Common Issues & Solutions

**Database Connection Failed**
- Check DATABASE_URL format
- Verify network connectivity
- Check PostgreSQL service status
- Review SSL certificate

**Mistral API Rate Limited**
- Add retry logic (3 attempts)
- Implement exponential backoff
- Use fallback generation
- Upgrade API plan if needed

**Payment Processing Fails**
- Verify Razorpay API keys
- Check HMAC signature
- Review payment logs
- Test with test credentials

### Monitoring & Alerts
- Database query performance
- API response times
- Error rates
- Memory usage
- Conversion success rate
- Payment transaction status

### Regular Maintenance Tasks
- Database maintenance (ANALYZE, REINDEX)
- Log rotation
- Backup verification
- Security updates
- Dependency updates
- Performance tuning

---

**Complete Documentation Package Generated**
**Total Documents:** 14
**Total Sections:** 100+
**Status:** Production Ready

---

**Document End**
