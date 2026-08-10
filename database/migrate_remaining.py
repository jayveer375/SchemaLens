import psycopg2
from psycopg2.extras import Json

neon  = psycopg2.connect("postgresql://neondb_owner:npg_1vqwG3LoHutE@ep-still-lab-aw203auj-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require")
local = psycopg2.connect("postgresql://postgres:root@localhost:5432/er_ai_studio")
lc = local.cursor()
nc = neon.cursor()

def adapt_row(row):
    return [Json(v) if isinstance(v, (dict, list)) else v for v in row]

def get_neon_cols(table):
    nc.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s", (table,))
    return {r[0] for r in nc.fetchall()}

def get_local_cols(table):
    lc.execute(f"SELECT * FROM {table} LIMIT 0")
    return [d[0] for d in lc.description]

def migrate(table):
    try:
        neon_cols  = get_neon_cols(table)
        local_cols = get_local_cols(table)
        common = [c for c in local_cols if c in neon_cols]
        print(f"{table}: using columns {common}")

        lc.execute(f"SELECT {','.join(common)} FROM {table}")
        rows = lc.fetchall()
        ph = ",".join(["%s"] * len(common))
        col_str = ",".join(common)

        nc.execute(f"DELETE FROM {table}")
        for row in rows:
            nc.execute(f"INSERT INTO {table} ({col_str}) VALUES ({ph}) ON CONFLICT DO NOTHING", adapt_row(row))
        neon.commit()
        print(f"  -> {len(rows)} rows migrated")
    except Exception as e:
        neon.rollback()
        print(f"  -> ERROR: {e}")

migrate("tool_history")
migrate("user_activity")
migrate("project_images")

local.close()
neon.close()
print("Migration complete!")
