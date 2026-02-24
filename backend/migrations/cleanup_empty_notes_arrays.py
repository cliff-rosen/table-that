"""
Clean up report_article_associations notes column:
  - Set notes = NULL where notes = '[]' (empty arrays left by delete)
  - Set notes = NULL where notes is not valid JSON (any legacy plain text)
"""

import asyncio
from sqlalchemy import text
from database import async_engine


async def run():
    async with async_engine.begin() as conn:
        # Clean empty arrays
        r1 = await conn.execute(text(
            "UPDATE report_article_associations SET notes = NULL WHERE notes = '[]'"
        ))
        print(f"Cleaned {r1.rowcount} rows with empty '[]' notes")

        # Clean any non-JSON values (legacy plain text)
        r2 = await conn.execute(text(
            "UPDATE report_article_associations SET notes = NULL "
            "WHERE notes IS NOT NULL AND NOT JSON_VALID(notes)"
        ))
        print(f"Cleaned {r2.rowcount} rows with non-JSON notes")


if __name__ == "__main__":
    asyncio.run(run())
