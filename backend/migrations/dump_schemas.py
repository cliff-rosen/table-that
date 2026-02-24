"""
Dump schemas from both khdev and kh2 for comparison.

Outputs:
  migrations/schema_khdev.sql
  migrations/schema_kh2.sql

These files can be sent to an LLM to identify differences and generate
the ALTER statements needed to bring kh2 in line with khdev.
"""

import pymysql
from pathlib import Path

# Both databases live on the same host with the same credentials.
# Read from .env directly to avoid coupling to settings.py / ENVIRONMENT.
from dotenv import dotenv_values

_backend_dir = Path(__file__).resolve().parent.parent
_env = dotenv_values(_backend_dir / ".env")

DB_HOST = _env["DB_HOST"]
DB_PORT = int(_env.get("DB_PORT", "3306"))
DB_USER = _env["DB_USER"]
DB_PASSWORD = _env["DB_PASSWORD"]

DATABASES = {
    "khdev": "schema_khdev.sql",
    "kh2": "schema_kh2.sql",
}

OUTPUT_DIR = Path(__file__).resolve().parent


def dump_schema(db_name: str) -> str:
    """Dump CREATE TABLE statements for all tables in a database."""
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER, password=DB_PASSWORD,
        database=db_name
    )
    cur = conn.cursor()

    # Get all tables, sorted alphabetically
    cur.execute("SHOW TABLES")
    tables = sorted(row[0] for row in cur.fetchall())

    lines = [f"-- Schema dump: {db_name}", f"-- Tables: {len(tables)}", ""]

    for table in tables:
        cur.execute(f"SHOW CREATE TABLE `{table}`")
        create_stmt = cur.fetchone()[1]
        lines.append(create_stmt + ";")
        lines.append("")

    conn.close()
    return "\n".join(lines)


def main():
    for db_name, filename in DATABASES.items():
        out_path = OUTPUT_DIR / filename
        print(f"Dumping {db_name}...")
        schema = dump_schema(db_name)
        out_path.write_text(schema, encoding="utf-8")
        print(f"  -> {out_path}")

    print()
    print("Done. Compare the two files to find schema differences.")
    print("Send both to an LLM and ask it to report the delta and generate ALTER statements.")


if __name__ == "__main__":
    main()
