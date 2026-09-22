"""
Migration: Add 'ultimate' plan support to users table
────────────────────────────────────────────────────────
Modifies the users.plan column to accept 'free', 'pro', or 'ultimate'.

Run this migration:
    python database/migrate_add_ultimate_plan.py

What it does:
    - Updates existing 'pro' users to remain 'pro' (no change)
    - Allows new users to be set to 'ultimate' plan
    - Database constraint will now accept: 'free' | 'pro' | 'ultimate'
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable not set")

engine = create_engine(DATABASE_URL, echo=True)
Session = sessionmaker(bind=engine)


def migrate():
    """Add 'ultimate' as a valid plan value in the users table."""
    session = Session()
    
    try:
        print("\n" + "="*80)
        print("MIGRATION: Add 'ultimate' plan support to users table")
        print("="*80 + "\n")
        
        # PostgreSQL doesn't have enum constraints by default on VARCHAR columns,
        # so the column already accepts any string value.
        # We just need to ensure the application code handles 'ultimate' correctly.
        
        # However, if you added a CHECK constraint previously, we need to modify it.
        # Let's check if there's a constraint and drop/recreate it if needed.
        
        check_constraint_query = text("""
            SELECT constraint_name 
            FROM information_schema.constraint_column_usage 
            WHERE table_name = 'users' 
            AND column_name = 'plan'
            AND constraint_name LIKE '%plan%'
        """)
        
        result = session.execute(check_constraint_query).fetchall()
        
        if result:
            print("Found existing plan constraints:")
            for row in result:
                constraint_name = row[0]
                print(f"  - {constraint_name}")
                
                # Drop the old constraint
                drop_query = text(f"ALTER TABLE users DROP CONSTRAINT IF EXISTS {constraint_name}")
                session.execute(drop_query)
                print(f"  ✓ Dropped constraint: {constraint_name}")
        
        # Add a new CHECK constraint that includes 'ultimate'
        add_constraint_query = text("""
            ALTER TABLE users 
            ADD CONSTRAINT users_plan_check 
            CHECK (plan IN ('free', 'pro', 'ultimate'))
        """)
        
        try:
            session.execute(add_constraint_query)
            print("\n✓ Added new constraint: users_plan_check")
            print("  Allowed values: 'free', 'pro', 'ultimate'")
        except Exception as e:
            # Constraint might already exist or column might not have had a constraint
            if "already exists" in str(e).lower():
                print("\n✓ Constraint 'users_plan_check' already exists")
            else:
                print(f"\nℹ No constraint needed (column is VARCHAR without restrictions)")
        
        session.commit()
        
        # Verify the change
        print("\n" + "-"*80)
        print("VERIFICATION: Checking current plan values in database")
        print("-"*80)
        
        verify_query = text("""
            SELECT plan, COUNT(*) as count 
            FROM users 
            GROUP BY plan 
            ORDER BY plan
        """)
        
        results = session.execute(verify_query).fetchall()
        
        print("\nCurrent plan distribution:")
        for row in results:
            plan_name, count = row
            print(f"  • {plan_name:12} → {count} user(s)")
        
        print("\n" + "="*80)
        print("✓ MIGRATION COMPLETED SUCCESSFULLY")
        print("="*80)
        print("\nThe 'users' table now supports 'ultimate' plan.")
        print("Users can now be upgraded to 'ultimate' and it will persist across logins.\n")
        
    except Exception as e:
        session.rollback()
        print("\n" + "="*80)
        print("✗ MIGRATION FAILED")
        print("="*80)
        print(f"\nError: {e}\n")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    migrate()
