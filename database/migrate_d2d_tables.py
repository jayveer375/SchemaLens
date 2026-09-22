"""
D2D Feature Database Migration
Adds d2d_diagrams table and related indexes to SchemaLens
Created: September 21, 2026
"""

import os
import sys
from sqlalchemy import create_engine, text
from datetime import datetime

# Database connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://neondb_owner:NpBrNwKWD8XP@ep-cool-mouse-a1ow6spt.us-east-1.neon.tech/neondb"
)

def run_migration():
    """Execute D2D database migration"""
    
    engine = create_engine(DATABASE_URL)
    
    migration_sql = """
    -- D2D (Document to Diagram) Feature Database Migration
    -- Adds d2d_diagrams table for storing user-generated diagrams
    -- Date: 2026-09-21
    
    BEGIN TRANSACTION;
    
    -- Create d2d_diagrams table
    CREATE TABLE IF NOT EXISTS d2d_diagrams (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        diagram_uid VARCHAR(50) UNIQUE NOT NULL,
        diagram_type VARCHAR(50) NOT NULL,
        input_type VARCHAR(20) NOT NULL,
        input_filename VARCHAR(255),
        input_content_preview TEXT,
        mermaid_syntax TEXT NOT NULL,
        generated_sql TEXT,
        recommended_type VARCHAR(50),
        user_selected_type VARCHAR(50),
        status VARCHAR(20) DEFAULT 'completed',
        error_message TEXT,
        processing_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    
    -- Create indexes for quick queries
    CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_user_id ON d2d_diagrams(user_id);
    CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_diagram_type ON d2d_diagrams(diagram_type);
    CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_created_at ON d2d_diagrams(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_status ON d2d_diagrams(status);
    
    -- Add comment to table
    COMMENT ON TABLE d2d_diagrams IS 'Stores user-generated diagrams from D2D (Document to Diagram) feature';
    
    -- Log migration
    INSERT INTO user_activity (user_id, activity_type, ip_address, user_agent, metadata_json)
    VALUES (1, 'system_migration', '127.0.0.1', 'migration_script', '{"migration": "d2d_tables", "timestamp": "' || NOW() || '"}')
    ON CONFLICT DO NOTHING;
    
    COMMIT;
    """
    
    try:
        with engine.connect() as conn:
            conn.execute(text("BEGIN TRANSACTION"))
            
            # Create d2d_diagrams table
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS d2d_diagrams (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    diagram_uid VARCHAR(50) UNIQUE NOT NULL,
                    diagram_type VARCHAR(50) NOT NULL,
                    input_type VARCHAR(20) NOT NULL,
                    input_filename VARCHAR(255),
                    input_content_preview TEXT,
                    mermaid_syntax TEXT NOT NULL,
                    generated_sql TEXT,
                    recommended_type VARCHAR(50),
                    user_selected_type VARCHAR(50),
                    status VARCHAR(20) DEFAULT 'completed',
                    error_message TEXT,
                    processing_time_ms INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """))
            
            # Create indexes
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_user_id ON d2d_diagrams(user_id)
            """))
            
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_diagram_type ON d2d_diagrams(diagram_type)
            """))
            
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_created_at ON d2d_diagrams(created_at DESC)
            """))
            
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_d2d_diagrams_status ON d2d_diagrams(status)
            """))
            
            conn.commit()
            
            print("✓ D2D migration completed successfully")
            print("✓ Created d2d_diagrams table")
            print("✓ Created 4 indexes for performance")
            return True
            
    except Exception as e:
        print(f"✗ Migration failed: {str(e)}")
        return False
    finally:
        engine.dispose()


def verify_migration():
    """Verify migration was successful"""
    engine = create_engine(DATABASE_URL)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT table_name FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'd2d_diagrams'
            """))
            
            if result.fetchone():
                print("✓ d2d_diagrams table verified")
                
                # Check indexes
                result = conn.execute(text("""
                    SELECT indexname FROM pg_indexes 
                    WHERE tablename = 'd2d_diagrams'
                """))
                
                indexes = result.fetchall()
                print(f"✓ Found {len(indexes)} indexes on d2d_diagrams")
                
                return True
            else:
                print("✗ d2d_diagrams table not found")
                return False
                
    except Exception as e:
        print(f"✗ Verification failed: {str(e)}")
        return False
    finally:
        engine.dispose()


if __name__ == "__main__":
    print("\n" + "="*60)
    print("D2D Feature Database Migration")
    print("="*60 + "\n")
    
    if run_migration():
        print("\n" + "-"*60)
        print("Verifying migration...")
        print("-"*60 + "\n")
        
        if verify_migration():
            print("\n" + "="*60)
            print("✓ Migration completed and verified successfully!")
            print("="*60 + "\n")
            sys.exit(0)
        else:
            sys.exit(1)
    else:
        sys.exit(1)
