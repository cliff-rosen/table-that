"""
Data migration script to convert old channel-based streams to category-based structure
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Get database connection info from environment
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

if not all([DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME]):
    raise ValueError("Missing database environment variables (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)")

# Construct DATABASE_URL
DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def generate_category_id(name: str) -> str:
    """Generate category ID from name"""
    import re
    clean_name = name.lower().replace(' ', '_').replace('&', 'and').replace('-', '_')
    return re.sub(r'[^a-z0-9_]', '', clean_name)

def convert_channel_to_category(channel: dict) -> dict:
    """Convert old channel structure to new category structure"""
    # Map channel type to topics
    focus = channel.get('focus', '')
    keywords = channel.get('keywords', [])
    
    # Use keywords as topics, and focus as a specific inclusion
    topics = keywords if keywords else [focus]
    specific_inclusions = [focus] if focus else []
    
    return {
        'id': generate_category_id(channel.get('name', 'category')),
        'name': channel.get('name', 'Unnamed Category'),
        'topics': topics,
        'specific_inclusions': specific_inclusions
    }

def migrate_research_streams():
    """Migrate all research streams from channel to category structure"""
    db = SessionLocal()

    try:
        # Get all streams
        result = db.execute(text("SELECT stream_id, stream_name, categories, workflow_config FROM research_streams"))
        streams = result.fetchall()
        
        print(f"Found {len(streams)} research streams to check...")
        
        migrated_count = 0
        skipped_count = 0
        
        for stream in streams:
            stream_id, stream_name, categories_json, workflow_config_json = stream

            if not categories_json:
                print(f"  Stream {stream_id} ({stream_name}): No categories, skipping")
                skipped_count += 1
                continue

            # Parse categories JSON
            categories = json.loads(categories_json) if isinstance(categories_json, str) else categories_json

            # Check if this is old channel structure (has 'channel_id' or 'focus' or 'type' or 'keywords')
            needs_migration = False
            if isinstance(categories, list) and len(categories) > 0:
                first_item = categories[0]
                if any(key in first_item for key in ['channel_id', 'focus', 'type', 'keywords']):
                    needs_migration = True

            if not needs_migration:
                print(f"  Stream {stream_id} ({stream_name}): Already migrated, skipping")
                skipped_count += 1
                continue

            # Convert channels to categories
            old_id_to_new_id = {}  # Map old channel_id to new category id
            new_categories = []
            for channel in categories:
                new_category = convert_channel_to_category(channel)
                new_categories.append(new_category)
                # Store mapping for workflow_config migration
                old_channel_id = channel.get('channel_id')
                if old_channel_id:
                    old_id_to_new_id[old_channel_id] = new_category['id']

            # Migrate workflow_config if it exists
            new_workflow_config = None
            if workflow_config_json:
                workflow_config = json.loads(workflow_config_json) if isinstance(workflow_config_json, str) else workflow_config_json

                # Check if it has old channel_configs structure
                if 'channel_configs' in workflow_config:
                    # Migrate channel_configs to category_configs
                    new_workflow_config = {
                        'category_configs': {},
                        'article_limit_per_week': workflow_config.get('article_limit_per_week')
                    }

                    for old_channel_id, channel_config in workflow_config['channel_configs'].items():
                        new_category_id = old_id_to_new_id.get(old_channel_id, old_channel_id)
                        new_workflow_config['category_configs'][new_category_id] = channel_config

            # Update the database
            if new_workflow_config:
                update_query = text("""
                    UPDATE research_streams
                    SET categories = :categories,
                        workflow_config = :workflow_config,
                        audience = COALESCE(audience, '[]'),
                        intended_guidance = COALESCE(intended_guidance, '[]'),
                        global_inclusion = COALESCE(global_inclusion, '[]'),
                        global_exclusion = COALESCE(global_exclusion, '[]')
                    WHERE stream_id = :stream_id
                """)

                db.execute(update_query, {
                    'categories': json.dumps(new_categories),
                    'workflow_config': json.dumps(new_workflow_config),
                    'stream_id': stream_id
                })
            else:
                update_query = text("""
                    UPDATE research_streams
                    SET categories = :categories,
                        audience = COALESCE(audience, '[]'),
                        intended_guidance = COALESCE(intended_guidance, '[]'),
                        global_inclusion = COALESCE(global_inclusion, '[]'),
                        global_exclusion = COALESCE(global_exclusion, '[]')
                    WHERE stream_id = :stream_id
                """)

                db.execute(update_query, {
                    'categories': json.dumps(new_categories),
                    'stream_id': stream_id
                })

            print(f"  Stream {stream_id} ({stream_name}): Migrated {len(categories)} channels to categories")
            migrated_count += 1
        
        db.commit()
        print(f"\nMigration complete!")
        print(f"  Migrated: {migrated_count}")
        print(f"  Skipped: {skipped_count}")
        print(f"  Total: {len(streams)}")
        
    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Starting research stream migration from channels to categories...")
    migrate_research_streams()
    print("Done!")
