import asyncio
from config.settings import settings
from tools.tool_registry import get_available_tools

# Use settings from config
OPENAI_API_KEY = settings.OPENAI_API_KEY
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is not set")
print(OPENAI_API_KEY)


async def run():
    print("Running test_x.py")
    print(get_available_tools())

if __name__ == "__main__":
    asyncio.run(run())

