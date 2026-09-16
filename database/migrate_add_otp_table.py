#!/usr/bin/env python3
"""
Migration script to add password_reset_otps table to the database.
Run this to fix the OTP verification issue.

Usage:
    python database/migrate_add_otp_table.py
"""

import os
import sys
from pathlib import Path

# Add parent directory to path to import database module
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ ERROR: DATABASE_URL not found in .env file")
    sys.exit(1)

def run_migration():
    """Execute the migration SQL script"""
    print("🔄 Starting migration: Add password_reset_otps table...")
    
    try:
        # Create engine
        engine = create_engine(DATABASE_URL)
        
        # Read SQL file
        sql_file = Path(__file__).parent / "add_otp_table.sql"
        with open(sql_file, 'r') as f:
            sql_content = f.read()
        
        # Execute migration as a single transaction
        with engine.connect() as conn:
            # Execute the entire SQL script at once
            conn.execute(text(sql_content))
            conn.commit()
        
        print("✅ Migration completed successfully!")
        print("   Table 'password_reset_otps' has been created")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
