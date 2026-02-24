"""
One-time backfill: Re-fetch date precision from PubMed for existing articles.

The original migration (017) populated pub_year/pub_month/pub_day from the old
publication_date column, which had fabricated precision (missing day/month defaulted
to 01). This script re-fetches from PubMed to get the actual precision.

Usage:
    cd backend
    python scripts/backfill_honest_dates.py          # dry-run (default)
    python scripts/backfill_honest_dates.py --apply   # actually write to DB
"""

import asyncio
import argparse
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dotenv import load_dotenv
load_dotenv()

import pymysql
from services.pubmed_service import fetch_articles_by_ids


def get_db_connection():
    return pymysql.connect(
        host=os.getenv('DB_HOST'),
        port=int(os.getenv('DB_PORT', 3306)),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME'),
        autocommit=True
    )


PK_COLUMN = {
    'articles': 'article_id',
    'wip_articles': 'id',
}


def get_pmids_from_table(cursor, table: str) -> dict[str, list[int]]:
    """Get all PMIDs from a table, mapped to their row IDs."""
    pk = PK_COLUMN[table]
    cursor.execute(f'SELECT {pk}, pmid FROM {table} WHERE pmid IS NOT NULL')
    pmid_to_ids: dict[str, list[int]] = {}
    for row_id, pmid in cursor.fetchall():
        pmid_to_ids.setdefault(pmid, []).append(row_id)
    return pmid_to_ids


async def backfill(apply: bool):
    conn = get_db_connection()
    cursor = conn.cursor()

    # Gather all unique PMIDs from both tables
    articles_map = get_pmids_from_table(cursor, 'articles')
    wip_map = get_pmids_from_table(cursor, 'wip_articles')

    all_pmids = sorted(set(articles_map.keys()) | set(wip_map.keys()))
    print(f"Found {len(all_pmids)} unique PMIDs ({len(articles_map)} in articles, {len(wip_map)} in wip_articles)")

    if not all_pmids:
        print("Nothing to do.")
        return

    # Fetch from PubMed in batches of 200
    BATCH_SIZE = 200
    pubmed_dates: dict[str, tuple] = {}  # pmid -> (year, month, day)

    for i in range(0, len(all_pmids), BATCH_SIZE):
        batch = all_pmids[i:i + BATCH_SIZE]
        print(f"Fetching batch {i // BATCH_SIZE + 1} ({len(batch)} PMIDs)...")
        try:
            articles = await fetch_articles_by_ids(batch)
            for article in articles:
                pubmed_dates[article.PMID] = (article.pub_year, article.pub_month, article.pub_day)
        except Exception as e:
            print(f"  ERROR fetching batch: {e}")
            continue

    print(f"Got dates for {len(pubmed_dates)} articles from PubMed")

    # Compare and report
    changes = {'articles': [], 'wip_articles': []}

    for table_name, pmid_map in [('articles', articles_map), ('wip_articles', wip_map)]:
        for pmid, row_ids in pmid_map.items():
            if pmid not in pubmed_dates:
                continue

            new_year, new_month, new_day = pubmed_dates[pmid]

            # Get current values
            pk = PK_COLUMN[table_name]
            for row_id in row_ids:
                cursor.execute(
                    f'SELECT pub_year, pub_month, pub_day FROM {table_name} WHERE {pk} = %s',
                    (row_id,)
                )
                current = cursor.fetchone()
                if not current:
                    continue

                old_year, old_month, old_day = current

                # Check what changed
                year_changed = old_year != new_year
                month_changed = old_month != new_month
                day_changed = old_day != new_day

                if year_changed or month_changed or day_changed:
                    changes[table_name].append({
                        'id': row_id,
                        'pmid': pmid,
                        'old': (old_year, old_month, old_day),
                        'new': (new_year, new_month, new_day),
                    })

    # Print summary
    print()
    print("=" * 70)
    print("CHANGES DETECTED")
    print("=" * 70)

    for table_name in ['articles', 'wip_articles']:
        table_changes = changes[table_name]
        if not table_changes:
            print(f"\n{table_name}: no changes needed")
            continue

        # Count types of changes
        month_nulled = sum(1 for c in table_changes if c['old'][1] is not None and c['new'][1] is None)
        day_nulled = sum(1 for c in table_changes if c['old'][2] is not None and c['new'][2] is None)
        month_changed = sum(1 for c in table_changes if c['old'][1] != c['new'][1])
        day_changed = sum(1 for c in table_changes if c['old'][2] != c['new'][2])

        print(f"\n{table_name}: {len(table_changes)} rows to update")
        print(f"  Month set to NULL (was fabricated): {month_nulled}")
        print(f"  Day set to NULL (was fabricated):   {day_nulled}")
        print(f"  Month value changed:                {month_changed}")
        print(f"  Day value changed:                  {day_changed}")

        # Show details
        for c in table_changes[:20]:
            old_str = f"{c['old'][0]}/{c['old'][1]}/{c['old'][2]}"
            new_str = f"{c['new'][0]}/{c['new'][1]}/{c['new'][2]}"
            print(f"    PMID {c['pmid']:>10} (id={c['id']:>6}): {old_str:>15} -> {new_str}")
        if len(table_changes) > 20:
            print(f"    ... and {len(table_changes) - 20} more")

    total_changes = sum(len(v) for v in changes.values())
    if total_changes == 0:
        print("\nAll dates already match PubMed. Nothing to do.")
        return

    # Apply if requested
    if not apply:
        print(f"\nDRY RUN: {total_changes} rows would be updated. Run with --apply to write changes.")
        return

    print(f"\nAPPLYING {total_changes} changes...")
    for table_name in ['articles', 'wip_articles']:
        pk = PK_COLUMN[table_name]
        for c in changes[table_name]:
            cursor.execute(
                f'UPDATE {table_name} SET pub_year = %s, pub_month = %s, pub_day = %s WHERE {pk} = %s',
                (c['new'][0], c['new'][1], c['new'][2], c['id'])
            )
    print("Done!")

    cursor.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description='Backfill honest date precision from PubMed')
    parser.add_argument('--apply', action='store_true', help='Actually write changes (default is dry-run)')
    args = parser.parse_args()

    asyncio.run(backfill(apply=args.apply))


if __name__ == '__main__':
    main()
