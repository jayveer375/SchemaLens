-- =============================================================================
-- Schemalens — Full PostgreSQL Schema
-- Generated from SQLAlchemy models (models.py)
--
-- HOW TO USE ON ANOTHER COMPUTER:
-- 1. Install PostgreSQL
-- 2. Open pgAdmin → create a database called: er_ai_studio
-- 3. Open pgAdmin Query Tool → paste this entire file → click Execute (F5)
-- OR via terminal:
--     psql -U postgres -d er_ai_studio -f schema.sql
-- =============================================================================

-- Drop tables in reverse dependency order (safe re-run)
DROP TABLE IF EXISTS export_logs    CASCADE;
DROP TABLE IF EXISTS api_usage      CASCADE;
DROP TABLE IF EXISTS payments       CASCADE;
DROP TABLE IF EXISTS user_activity  CASCADE;
DROP TABLE IF EXISTS conversions    CASCADE;
DROP TABLE IF EXISTS images         CASCADE;
DROP TABLE IF EXISTS users          CASCADE;

-- =============================================================================
-- TABLE 1: users
-- Every registered account on the portal
-- =============================================================================
CREATE TABLE users (
    id                          SERIAL PRIMARY KEY,
    full_name                   VARCHAR(100)    NOT NULL,
    email                       VARCHAR(255)    NOT NULL UNIQUE,
    password_hash               VARCHAR(255)    NOT NULL,
    role                        VARCHAR(20)     NOT NULL DEFAULT 'user',
    plan                        VARCHAR(20)     NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'ultimate'
    is_active                   BOOLEAN         NOT NULL DEFAULT TRUE,
    email_verified              BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at                  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login                  TIMESTAMP,
    conversions_used_this_month INTEGER         NOT NULL DEFAULT 0
);

CREATE INDEX idx_users_email ON users(email);

-- =============================================================================
-- TABLE 2: images
-- Every ER diagram image uploaded by a user
-- File is stored on disk; file_path records where
-- =============================================================================
CREATE TABLE images (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename            VARCHAR(255)    NOT NULL,
    original_filename   VARCHAR(255)    NOT NULL,
    file_path           VARCHAR(500)    NOT NULL,
    file_size_bytes     INTEGER,
    mime_type           VARCHAR(50),
    upload_timestamp    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_processed        BOOLEAN         NOT NULL DEFAULT FALSE,
    processing_status   VARCHAR(50)     NOT NULL DEFAULT 'pending'
    -- processing_status values: 'pending' | 'processing' | 'completed' | 'failed'
);

CREATE INDEX idx_images_user_id ON images(user_id);

-- =============================================================================
-- TABLE 3: conversions
-- Every DDL generation result — the full SQL that was generated is stored here
-- =============================================================================
CREATE TABLE conversions (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_id                INTEGER     NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    generated_ddl           TEXT,
    dialect                 VARCHAR(30) NOT NULL DEFAULT 'postgresql',
    conversion_timestamp    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success                 BOOLEAN     NOT NULL DEFAULT TRUE,
    error_message           TEXT,
    execution_time_ms       INTEGER,
    tables_count            INTEGER     NOT NULL DEFAULT 0,
    relationships_count     INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX idx_conversions_user_id ON conversions(user_id);

-- =============================================================================
-- TABLE 4: user_activity
-- Full audit trail — every login, upload, convert, download, etc.
-- =============================================================================
CREATE TABLE user_activity (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER     REFERENCES users(id) ON DELETE CASCADE,
    activity_type   VARCHAR(50) NOT NULL,
    -- Values: 'register' | 'login' | 'login_failed' | 'logout'
    --         'upload' | 'convert' | 'export' | 'delete_image'
    --         'payment' | 'upgrade' | 'password_reset'
    description     TEXT,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    timestamp       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata_json   JSONB
);

CREATE INDEX idx_user_activity_user_id  ON user_activity(user_id);
CREATE INDEX idx_user_activity_timestamp ON user_activity(timestamp DESC);

-- =============================================================================
-- TABLE 5: payments
-- Razorpay payment records — one row per payment attempt
-- =============================================================================
CREATE TABLE payments (
    id                      SERIAL PRIMARY KEY,
    user_id                 INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    razorpay_order_id       VARCHAR(100) UNIQUE,
    razorpay_payment_id     VARCHAR(100) UNIQUE,
    razorpay_signature      VARCHAR(255),
    amount_paise            INTEGER     NOT NULL,
    currency                VARCHAR(10) NOT NULL DEFAULT 'INR',
    plan_purchased          VARCHAR(30) NOT NULL,
    status                  VARCHAR(30) NOT NULL DEFAULT 'created',
    -- status values: 'created' | 'paid' | 'failed' | 'refunded'
    created_at              TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_at             TIMESTAMP
);

CREATE INDEX idx_payments_user_id ON payments(user_id);

-- =============================================================================
-- TABLE 6: api_usage
-- Every Mistral AI API call — for rate limiting and cost tracking
-- =============================================================================
CREATE TABLE api_usage (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint            VARCHAR(100) NOT NULL,
    -- endpoint values: '/api/analyze' | '/api/generate' | '/api/migrate'
    model_used          VARCHAR(100),
    tokens_used         INTEGER,
    processing_time_ms  INTEGER,
    success             BOOLEAN     NOT NULL DEFAULT TRUE,
    called_at           TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_usage_user_id  ON api_usage(user_id);
CREATE INDEX idx_api_usage_called_at ON api_usage(called_at DESC);

-- =============================================================================
-- TABLE 7: export_logs
-- Every time a user downloads or copies a generated SQL script
-- =============================================================================
CREATE TABLE export_logs (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversion_id   INTEGER     REFERENCES conversions(id) ON DELETE SET NULL,
    format          VARCHAR(20) NOT NULL,
    -- format values: 'sql' | 'txt' | 'json' | 'copy'
    exported_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_export_logs_user_id ON export_logs(user_id);

-- =============================================================================
-- SEED DATA — sample records so you can immediately see data in pgAdmin
-- Password for both accounts is: Test@1234
-- (bcrypt hash of 'Test@1234')
-- =============================================================================
INSERT INTO users (full_name, email, password_hash, role, plan, is_active, email_verified, conversions_used_this_month)
VALUES
(
    'Demo User',
    'demo@eraisudio.com',
    '$2b$12$KIXkRhSLhT1r5BRH.Y7.NOzYwHUWGbRbFLQvMHn6m0F6nwkJXsFwq',
    'user',
    'free',
    TRUE,
    TRUE,
    3
),
(
    'Admin User',
    'admin@eraisudio.com',
    '$2b$12$KIXkRhSLhT1r5BRH.Y7.NOzYwHUWGbRbFLQvMHn6m0F6nwkJXsFwq',
    'admin',
    'pro',
    TRUE,
    TRUE,
    12
);

INSERT INTO user_activity (user_id, activity_type, description, ip_address, timestamp)
VALUES
(1, 'register',  'Demo user registered',                '127.0.0.1', NOW() - INTERVAL '2 days'),
(1, 'login',     'User logged in successfully',          '127.0.0.1', NOW() - INTERVAL '1 day'),
(1, 'upload',    'Uploaded: university_er.png',          '127.0.0.1', NOW() - INTERVAL '1 day'),
(1, 'convert',   'Generated PostgreSQL DDL from image',  '127.0.0.1', NOW() - INTERVAL '1 day'),
(2, 'register',  'Admin user registered',                '127.0.0.1', NOW() - INTERVAL '3 days'),
(2, 'login',     'Admin logged in',                      '127.0.0.1', NOW() - INTERVAL '1 hour');

-- =============================================================================
-- USEFUL QUERIES — copy and paste into pgAdmin Query Tool
-- =============================================================================

-- See all users:
-- SELECT id, full_name, email, role, plan, is_active, created_at, last_login FROM users;

-- See all uploaded images:
-- SELECT i.id, u.full_name, i.original_filename, i.upload_timestamp, i.processing_status
-- FROM images i JOIN users u ON i.user_id = u.id ORDER BY i.upload_timestamp DESC;

-- See all conversions:
-- SELECT c.id, u.full_name, i.original_filename, c.dialect, c.success, c.conversion_timestamp
-- FROM conversions c
-- JOIN users u ON c.user_id = u.id
-- JOIN images i ON c.image_id = i.id
-- ORDER BY c.conversion_timestamp DESC;

-- See full activity log:
-- SELECT a.id, u.full_name, a.activity_type, a.description, a.timestamp
-- FROM user_activity a JOIN users u ON a.user_id = u.id
-- ORDER BY a.timestamp DESC;

-- Per-user stats:
-- SELECT
--     u.full_name,
--     u.plan,
--     COUNT(DISTINCT i.id)  AS total_uploads,
--     COUNT(DISTINCT c.id)  AS total_conversions,
--     COUNT(DISTINCT e.id)  AS total_exports,
--     u.conversions_used_this_month
-- FROM users u
-- LEFT JOIN images i      ON u.id = i.user_id
-- LEFT JOIN conversions c ON u.id = c.user_id
-- LEFT JOIN export_logs e ON u.id = e.user_id
-- GROUP BY u.id, u.full_name, u.plan, u.conversions_used_this_month;

-- =============================================================================
-- TABLE 11: project_images
-- ER diagram images uploaded inside a project workspace.
-- Stores base64 image data so images persist across logins/reloads.
-- One row per image file per project.
--
-- Verify with:
--   SELECT pi.id, u.full_name, p.name AS project,
--          pi.original_filename, pi.status,
--          pi.tables_count, pi.uploaded_at
--   FROM project_images pi
--   JOIN users    u ON pi.user_id     = u.id
--   JOIN projects p ON pi.project_uid = p.project_uid
--   ORDER BY pi.uploaded_at DESC;
-- =============================================================================

DROP TABLE IF EXISTS project_images CASCADE;

CREATE TABLE project_images (
    id                    SERIAL PRIMARY KEY,
    image_uid             VARCHAR(100)    NOT NULL UNIQUE,
    user_id               INTEGER         NOT NULL REFERENCES users(id)              ON DELETE CASCADE,
    project_uid           VARCHAR(100)    NOT NULL REFERENCES projects(project_uid)  ON DELETE CASCADE,
    original_filename     VARCHAR(255)    NOT NULL,
    mime_type             VARCHAR(50),
    file_size_bytes       INTEGER,
    image_data            TEXT,           -- base64 data URL  e.g. data:image/png;base64,...
    status                VARCHAR(30)     NOT NULL DEFAULT 'waiting',
    -- status values: 'waiting' | 'processing' | 'completed' | 'failed'
    generated_sql         TEXT,           -- SQL produced from this image by AI
    tables_count          INTEGER         NOT NULL DEFAULT 0,
    relationships_count   INTEGER         NOT NULL DEFAULT 0,
    processing_time_ms    INTEGER,
    uploaded_at           TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at          TIMESTAMP
);

CREATE INDEX idx_project_images_user_id     ON project_images(user_id);
CREATE INDEX idx_project_images_project_uid ON project_images(project_uid);
CREATE INDEX idx_project_images_uploaded_at ON project_images(uploaded_at DESC);
