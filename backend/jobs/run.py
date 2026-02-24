import asyncio
from langchain_core.prompts import ChatPromptTemplate
from openai import OpenAI
from config.settings import settings


# Use settings from config
OPENAI_API_KEY = settings.OPENAI_API_KEY
if not OPENAI_API_KEY:
    raise ValueError("OPENAI_API_KEY environment variable is not set")
print(OPENAI_API_KEY)

client = OpenAI(api_key=OPENAI_API_KEY)

async def run():
    print("Running...")


    response = client.responses.create(
        model="gpt-4o-mini",
        input="What is deep research by OpenAI?",
        tools=[{
            "type": "file_search",
            "vector_store_ids": ["vs_68347e57e7408191a5a775f40db83f44"]
        }],
        include=["file_search_call.results"]
    )

    # write result to file
    with open("result.json", "w") as f:
        f.write(response.model_dump_json())

    print("Done")

if __name__ == "__main__":
    asyncio.run(run())

