-- Migration: Add password_reset_otps table
-- This table stores OTP codes for password reset, persisting them across server restarts

-- Drop table if it exists (for clean migration)
DROP TABLE IF EXISTS password_reset_otps CASCADE;

-- Create the table
CREATE TABLE password_reset_otps (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    verified BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

-- Create indexes for faster lookups
CREATE INDEX idx_password_reset_otps_user_id ON password_reset_otps(user_id);
CREATE INDEX idx_password_reset_otps_email ON password_reset_otps(email);
