# Database Design Document
## SchemaLens - PostgreSQL Schema

**Version:** 1.0  
**Database:** PostgreSQL 15+  
**ORM:** SQLAlchemy  
**Hosting:** Neon PostgreSQL (Cloud)  

---

## 1. Database Overview

SchemaLens uses a **normalized PostgreSQL relational database** with 12 tables designed to support user management, project organization, image processing, payment handling, and comprehensive activity tracking.

**Design Principles:**
- Normalization: 3NF (Third Normal Form)
- Referential Integrity: Foreign keys with cascade delete
- Performance: Strategic indexing on query columns
- Auditability: Comprehensive timestamp tracking
- Scalability: Partitioning-ready schema

---

## 2. Table Specifications

### TABLE 1: users
**Purpose:** Core user authentication and account information  
**Primary Key:** id (SERIAL)  
**Unique Constraints:** email, google_id  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Unique user identifier |
| full_name | VARCHAR(100) | NOT NULL | User's display name |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Login email & communication |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hashed password |
| role | VARCHAR(20) | DEFAULT 'user' | 'user' or 'admin' |
| plan | VARCHAR(20) | DEFAULT 'free' | 'free' or 'pro' subscription |
| is_active | BOOLEAN | DEFAULT TRUE | Account status |
| email_verified | BOOLEAN | DEFAULT FALSE | Email confirmation status |
| created_at | TIMESTAMP | DEFAULT NOW() | Account creation time |
| last_login | TIMESTAMP | NULL | Last login timestamp |
| conversions_used_this_month | INTEGER | DEFAULT 0 | Usage tracking |
| avatar_url | TEXT | NULL | Profile picture URL |
| google_id | VARCHAR(128) | UNIQUE, NULL | Google OAuth ID |

**Indexes:**
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
```

**Relationships:**
- ← 1:N images.user_id
- ← 1:N conversions.user_id
- ← 1:N user_activity.user_id
- ← 1:N payments.user_id
- ← 1:N api_usage.user_id
- ← 1:N export_logs.user_id
- ← 1:N projects.user_id
- ← 1:N quick_history.user_id
- ← 1:N project_images.user_id

---

### TABLE 2: images
**Purpose:** Store metadata for uploaded ER diagram images  
**Primary Key:** id (SERIAL)  
**Foreign Key:** user_id → users.id (CASCADE DELETE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Unique image identifier |
| user_id | INTEGER | FK, NOT NULL, INDEX | Owner of image |
| filename | VARCHAR(255) | NOT NULL | Sanitized filename on disk |
| original_filename | VARCHAR(255) | NOT NULL | User's original filename |
| file_path | VARCHAR(500) | NOT NULL | Full disk path to image |
| file_size_bytes | INTEGER | NULL | Image file size |
| mime_type | VARCHAR(50) | NULL | Content type (image/png, etc.) |
| upload_timestamp | TIMESTAMP | DEFAULT NOW() | Upload date/time |
| is_processed | BOOLEAN | DEFAULT FALSE | Processing status |
| processing_status | VARCHAR(50) | DEFAULT 'pending' | 'pending'/'processing'/'completed'/'failed' |

**Indexes:**
```sql
CREATE INDEX idx_images_user_id ON images(user_id);
CREATE INDEX idx_images_upload_timestamp ON images(upload_timestamp DESC);
```

**Sample Query:**
```sql
SELECT i.id, u.full_name, i.original_filename, i.upload_timestamp
FROM images i
JOIN users u ON i.user_id = u.id
WHERE u.id = ? 
ORDER BY i.upload_timestamp DESC;
```

---

### TABLE 3: conversions
**Purpose:** Store AI-generated SQL conversion results  
**Primary Key:** id (SERIAL)  
**Foreign Keys:** user_id, image_id → users/images (CASCADE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Unique conversion identifier |
| user_id | INTEGER | FK, NOT NULL, INDEX | User who initiated conversion |
| image_id | INTEGER | FK, NULL | Source image (nullable for text inputs) |
| generated_ddl | TEXT | NULL | Generated SQL DDL script |
| dialect | VARCHAR(30) | DEFAULT 'postgresql' | Target database dialect |
| conversion_timestamp | TIMESTAMP | DEFAULT NOW() | Conversion date/time |
| success | BOOLEAN | DEFAULT TRUE | Conversion success flag |
| error_message | TEXT | NULL | Error details if failed |
| execution_time_ms | INTEGER | NULL | AI processing time in milliseconds |
| tables_count | INTEGER | DEFAULT 0 | Number of tables generated |
| relationships_count | INTEGER | DEFAULT 0 | Number of relationships identified |

**Indexes:**
```sql
CREATE INDEX idx_conversions_user_id ON conversions(user_id);
CREATE INDEX idx_conversions_conversion_timestamp ON conversions(conversion_timestamp DESC);
```

**Sample Queries:**
```sql
-- Get user's conversion history
SELECT * FROM conversions WHERE user_id = ? ORDER BY conversion_timestamp DESC LIMIT 20;

-- Get monthly conversion count
SELECT COUNT(*) FROM conversions 
WHERE user_id = ? AND DATE_TRUNC('month', conversion_timestamp) = CURRENT_DATE;
```

---

### TABLE 4: user_activity
**Purpose:** Comprehensive audit trail of all user actions  
**Primary Key:** id (SERIAL)  
**Foreign Key:** user_id → users.id (NULL allowed for system actions)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Activity log entry ID |
| user_id | INTEGER | FK, NULL, INDEX | User performing action |
| activity_type | VARCHAR(50) | NOT NULL | 'register','login','upload','convert','export',etc. |
| description | TEXT | NULL | Detailed description |
| ip_address | VARCHAR(45) | NULL | IPv4 or IPv6 address |
| user_agent | TEXT | NULL | Browser/client information |
| timestamp | TIMESTAMP | DEFAULT NOW(), INDEX | Activity timestamp |
| metadata_json | JSONB | NULL | Structured extra data |

**Activity Types:**
- Authentication: register, login, login_failed, logout, password_change, password_reset
- Operations: upload, convert, export, delete_image, create_project
- Admin: suspend_user, plan_change, role_change
- Payment: payment_initiated, payment_success, payment_failed

**Indexes:**
```sql
CREATE INDEX idx_user_activity_user_id ON user_activity(user_id);
CREATE INDEX idx_user_activity_timestamp ON user_activity(timestamp DESC);
```

---

### TABLE 5: payments
**Purpose:** Razorpay payment transaction records  
**Primary Key:** id (SERIAL)  
**Foreign Key:** user_id → users.id (CASCADE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Payment record ID |
| user_id | INTEGER | FK, NOT NULL, INDEX | User making payment |
| razorpay_order_id | VARCHAR(100) | UNIQUE, NULL | Razorpay order identifier |
| razorpay_payment_id | VARCHAR(100) | UNIQUE, NULL | Razorpay payment identifier |
| razorpay_signature | VARCHAR(255) | NULL | HMAC-SHA256 signature |
| amount_paise | INTEGER | NOT NULL | Amount in paise (100 paise = ₹1) |
| currency | VARCHAR(10) | DEFAULT 'INR' | Currency code |
| plan_purchased | VARCHAR(30) | NOT NULL | Plan type (pro_monthly, pro_annual, etc.) |
| status | VARCHAR(30) | DEFAULT 'created' | 'created'/'paid'/'failed'/'refunded' |
| created_at | TIMESTAMP | DEFAULT NOW() | Payment creation time |
| verified_at | TIMESTAMP | NULL | Payment verification time |

**Indexes:**
```sql
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_razorpay_order_id ON payments(razorpay_order_id);
```

**Sample Query:**
```sql
-- Get latest payment for user
SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1;
```

---

### TABLE 6: api_usage
**Purpose:** Track Mistral AI API calls for rate limiting and cost analysis  
**Primary Key:** id (SERIAL)  
**Foreign Key:** user_id → users.id (CASCADE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | API call record ID |
| user_id | INTEGER | FK, NOT NULL, INDEX | User making API call |
| endpoint | VARCHAR(100) | NOT NULL | Endpoint path (e.g., '/analyze', '/generate') |
| model_used | VARCHAR(100) | NULL | AI model name (e.g., 'mistral-small-latest') |
| tokens_used | INTEGER | NULL | Token consumption for billing |
| processing_time_ms | INTEGER | NULL | Total processing time |
| success | BOOLEAN | DEFAULT TRUE | Success/failure flag |
| called_at | TIMESTAMP | DEFAULT NOW(), INDEX | API call timestamp |

**Indexes:**
```sql
CREATE INDEX idx_api_usage_user_id ON api_usage(user_id);
CREATE INDEX idx_api_usage_called_at ON api_usage(called_at DESC);
```

---

### TABLE 7: export_logs
**Purpose:** Track user downloads and exports  
**Primary Key:** id (SERIAL)  
**Foreign Keys:** user_id, conversion_id  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Export log entry ID |
| user_id | INTEGER | FK, NOT NULL, INDEX | User exporting |
| conversion_id | INTEGER | FK, NULL | Associated conversion |
| format | VARCHAR(20) | NOT NULL | 'sql'/'txt'/'json'/'copy' |
| exported_at | TIMESTAMP | DEFAULT NOW() | Export timestamp |

---

### TABLE 8: projects
**Purpose:** User-created project workspaces  
**Primary Key:** id (SERIAL), project_uid (UNIQUE)  
**Foreign Key:** user_id → users.id (CASCADE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Internal project ID |
| project_uid | VARCHAR(100) | UNIQUE, NOT NULL, INDEX | Universally unique project ID |
| user_id | INTEGER | FK, NOT NULL, INDEX | Project owner |
| name | VARCHAR(255) | NOT NULL | Project display name |
| description | TEXT | NULL | Project description |
| db_type | VARCHAR(50) | DEFAULT 'postgresql' | Default target database |
| files_json | JSON | NULL | Array of project files |
| pinned | BOOLEAN | DEFAULT FALSE | Pin for quick access |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

**Indexes:**
```sql
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_project_uid ON projects(project_uid);
```

---

### TABLE 9: quick_history
**Purpose:** Quick Convert history (conversions without projects)  
**Primary Key:** id (SERIAL), entry_uid (UNIQUE)  
**Foreign Key:** user_id → users.id (CASCADE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | History entry ID |
| entry_uid | VARCHAR(100) | UNIQUE, NOT NULL | Unique entry identifier |
| user_id | INTEGER | FK, NOT NULL, INDEX | User who performed conversion |
| filename | VARCHAR(255) | NOT NULL | Original filename |
| sql | TEXT | NOT NULL | Generated SQL |
| stats_json | JSON | NULL | Stats (tables, relationships, attributes) |
| processing_time_ms | INTEGER | NULL | Processing time |
| created_at | TIMESTAMP | DEFAULT NOW(), INDEX | Conversion timestamp |

**Indexes:**
```sql
CREATE INDEX idx_quick_history_user_id ON quick_history(user_id);
CREATE INDEX idx_quick_history_created_at ON quick_history(created_at DESC);
```

---

### TABLE 10: tool_history
**Purpose:** Cross-tool usage analytics  
**Primary Key:** id (SERIAL), history_uid (UNIQUE)  
**Foreign Key:** user_id → users.id (CASCADE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | History entry ID |
| history_uid | VARCHAR(100) | UNIQUE, NOT NULL | Unique entry identifier |
| user_id | INTEGER | FK, NOT NULL, INDEX | User who used tool |
| tool | VARCHAR(50) | NOT NULL | 'quick_convert'/'generate'/'migrate' |
| action_label | VARCHAR(255) | NOT NULL | User-friendly action description |
| result_sql | TEXT | NULL | Generated or converted SQL |
| dialect_from | VARCHAR(30) | NULL | Source dialect (for migrate) |
| dialect_to | VARCHAR(30) | NULL | Target dialect (for migrate) |
| tables_count | INTEGER | DEFAULT 0 | Number of tables |
| processing_time_ms | INTEGER | NULL | Processing time |
| success | BOOLEAN | DEFAULT TRUE | Success flag |
| extra_json | JSON | NULL | Tool-specific extra data |
| created_at | TIMESTAMP | DEFAULT NOW(), INDEX | Timestamp |

---

### TABLE 11: password_reset_otps
**Purpose:** One-time passwords for password recovery  
**Primary Key:** id (SERIAL)  
**Foreign Key:** user_id → users.id (CASCADE)  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | OTP record ID |
| user_id | INTEGER | FK, NOT NULL | User requesting reset |
| email | VARCHAR(255) | NOT NULL, INDEX | Email for OTP delivery |
| otp_code | VARCHAR(10) | NOT NULL | 6-digit OTP code |
| verified | BOOLEAN | DEFAULT FALSE | Verification status |
| created_at | TIMESTAMP | DEFAULT NOW() | OTP creation time |
| expires_at | TIMESTAMP | NOT NULL | OTP expiration (10 minutes) |

**Indexes:**
```sql
CREATE INDEX idx_password_reset_otps_email ON password_reset_otps(email);
CREATE INDEX idx_password_reset_otps_expires_at ON password_reset_otps(expires_at);
```

---

### TABLE 12: project_images
**Purpose:** ER diagram images stored within projects (with Base64 data)  
**Primary Key:** id (SERIAL), image_uid (UNIQUE)  
**Foreign Keys:** user_id, project_uid  

| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | SERIAL | PK | Image record ID |
| image_uid | VARCHAR(100) | UNIQUE, NOT NULL, INDEX | Unique image identifier |
| user_id | INTEGER | FK, NOT NULL, INDEX | Image owner |
| project_uid | VARCHAR(100) | FK, NOT NULL, INDEX | Parent project |
| original_filename | VARCHAR(255) | NOT NULL | User's original filename |
| mime_type | VARCHAR(50) | NULL | Content type |
| file_size_bytes | INTEGER | NULL | File size |
| image_data | TEXT | NULL | Base64 data URL (complete data) |
| status | VARCHAR(30) | DEFAULT 'waiting' | 'waiting'/'processing'/'completed'/'failed' |
| generated_sql | TEXT | NULL | SQL generated from this image |
| tables_count | INTEGER | DEFAULT 0 | Number of tables |
| relationships_count | INTEGER | DEFAULT 0 | Number of relationships |
| processing_time_ms | INTEGER | NULL | AI processing time |
| uploaded_at | TIMESTAMP | DEFAULT NOW(), INDEX | Upload time |
| completed_at | TIMESTAMP | NULL | Completion time |

**Indexes:**
```sql
CREATE INDEX idx_project_images_user_id ON project_images(user_id);
CREATE INDEX idx_project_images_project_uid ON project_images(project_uid);
CREATE INDEX idx_project_images_uploaded_at ON project_images(uploaded_at DESC);
```

---

## 3. Relationships & Constraints

### Foreign Key Relationships

```
users (1) ──── (N) images (CASCADE)
users (1) ──── (N) conversions (CASCADE)
users (1) ──── (N) user_activity (CASCADE)
users (1) ──── (N) payments (CASCADE)
users (1) ──── (N) api_usage (CASCADE)
users (1) ──── (N) export_logs (CASCADE)
users (1) ──── (N) projects (CASCADE)
users (1) ──── (N) quick_history (CASCADE)
users (1) ──── (N) tool_history (CASCADE)
users (1) ──── (N) password_reset_otps (CASCADE)
users (1) ──── (N) project_images (CASCADE)

images (1) ──── (N) conversions (CASCADE)

projects (1) ──── (N) project_images (CASCADE)

conversions (1) ──── (N) export_logs (SET NULL)
```

### Cascade Delete Policy

All user-related tables use `ON DELETE CASCADE`, ensuring:
- When user is deleted, all associated data is removed
- Data consistency across tables
- No orphaned records

---

## 4. Data Integrity Rules

### Constraints

1. **Unique Constraints:**
   - users: email, google_id
   - projects: project_uid
   - quick_history: entry_uid
   - tool_history: history_uid
   - project_images: image_uid
   - payments: razorpay_order_id, razorpay_payment_id

2. **Not Null Constraints:**
   - users: full_name, email, password_hash
   - images: user_id, filename, original_filename, file_path
   - conversions: user_id, dialect
   - projects: user_id, name
   - All: timestamps (created_at, etc.)

3. **Check Constraints** (Application-level):
   - plan: 'free' or 'pro'
   - role: 'user' or 'admin'
   - processing_status: specific enum values
   - payment status: specific enum values

---

## 5. Indexing Strategy

### Performance-Critical Indexes

| Table | Column(s) | Type | Reason |
|-------|-----------|------|--------|
| users | email | UNIQUE | Login lookups |
| users | google_id | UNIQUE | Google OAuth lookups |
| images | user_id | Regular | User's image list |
| conversions | user_id | Regular | User's conversion history |
| conversions | conversion_timestamp | Regular | Time-based queries |
| projects | user_id, project_uid | Regular | Project lookups |
| quick_history | user_id, created_at | Regular | History retrieval |
| user_activity | user_id, timestamp | Regular | Activity logs |
| payments | user_id, razorpay_order_id | Regular | Payment lookups |

### Index Maintenance

```sql
-- Analyze table statistics
ANALYZE users;

-- Reindex if performance degrades
REINDEX TABLE users;
```

---

## 6. Partitioning Strategy (Future)

For scaling, implement time-based partitioning:

```sql
-- Example: Partition user_activity by month
CREATE TABLE user_activity_2024_09 PARTITION OF user_activity
  FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
```

---

## 7. Backup & Recovery

### Backup Strategy
- Daily incremental backups (Neon automatic)
- Weekly full backups (Neon automatic)
- Point-in-time recovery: 7-30 days (configurable)

### Recovery Procedures
```bash
# Restore specific table from backup
pg_restore --table=users --dbname=target_db dump.sql

# Point-in-time recovery
pg_restore --recovery-target-time='2024-09-20 14:30:00' dump.sql
```

---

## 8. Performance Monitoring

### Key Metrics

```sql
-- Slow queries
SELECT query, mean_time FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;

-- Table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes 
WHERE idx_scan = 0;
```

---

## 9. Data Migration & Seeding

### Seed Data Script

```sql
-- Insert demo user
INSERT INTO users (full_name, email, password_hash, role, plan, is_active, email_verified)
VALUES ('Demo User', 'demo@schemalens.com', '$2b$12$...', 'user', 'free', true, true);

-- Insert demo conversion
INSERT INTO conversions (user_id, generated_ddl, dialect, success, tables_count, relationships_count)
VALUES (1, 'CREATE TABLE...', 'postgresql', true, 3, 2);
```

---

**Document End**
