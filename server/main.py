import os
from fastapi import FastAPI, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from openai import OpenAI
from pathlib import Path
from pprint import pprint
from datetime import datetime, timedelta
import finnhub
import asyncio
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR.parent / ".env.local"

load_dotenv(dotenv_path=ENV_PATH)

app = FastAPI(title="Financial Watchlist RAG Service", version="1.0.0")

# 1. Allow Cross-Origin Requests from Next.js (localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Local AI Configuration (LM Studio Integration)
LM_STUDIO_URL = "http://localhost:1234/v1"

embedding_function = OpenAIEmbeddingFunction(
    api_key="lm-studio",
    api_base=LM_STUDIO_URL,
    model_name="nomic-ai/nomic-embed-text-v1.5-GGF",
)

BASE_DIR = Path(__file__).resolve().parent

# Force the Chroma DB folder to live strictly inside watchlist/server/chroma_db/
CHROMA_DB_PATH = os.path.join(BASE_DIR, "chroma_db")

print(f"📁 Initializing ChromaDB at absolute location: {CHROMA_DB_PATH}")

# FIXED: Passed the absolute CHROMA_DB_PATH variable instead of relative "./chroma_db"
chroma_client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
collection = chroma_client.get_or_create_collection(
    name="expert_stock_analysis", embedding_function=embedding_function
)

llm_client = OpenAI(base_url=LM_STUDIO_URL, api_key="lm-studio")


# 3. Pydantic Models for Strict Request/Response Typing
class QueryRequest(BaseModel):
    ticker: str
    question: str


class QueryResponse(BaseModel):
    ticker: str
    analysis: str
    sources: List[dict]


# 4. Helper Function: Smart Text Chunking
def recursive_sentence_chunk(
    text: str, max_chars: int = 800, overlap: int = 100
) -> List[str]:
    sentences = text.replace("\n", " ").split(". ")
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        sentence = sentence.strip() + ". "
        if len(current_chunk) + len(sentence) <= max_chars:
            current_chunk += sentence
        else:
            if current_chunk:
                chunks.append(current_chunk.strip())
            words = current_chunk.split(" ")
            overlap_text = " ".join(words[-15:]) if len(words) > 15 else current_chunk
            current_chunk = overlap_text + " " + sentence

    if current_chunk:
        chunks.append(current_chunk.strip())
    return chunks


# ==========================================
# 🛠️ CORE BUSINESS LOGIC: SCRAPER & ENGINE
# ==========================================


async def fetch_and_index_expert_news(ticker_symbol: str) -> bool:
    """
    Fetches real-time stock-specific news from Finnhub using the official SDK,
    offloads blocking calls to a worker thread, and chunks into ChromaDB.
    """
    print(f"📡 Fetching professional feeds for {ticker_symbol} from Finnhub Client...")

    FINNHUB_TOKEN = os.environ.get("FINNHUB_API_KEY", "YOUR_FINNHUB_API_KEY")
    if FINNHUB_TOKEN == "YOUR_FINNHUB_API_KEY" or not FINNHUB_TOKEN:
        print("❌ Error: Missing FINNHUB_API_KEY environment variable.")
        return False

    # 1. Initialize the official client engine
    finnhub_client = finnhub.Client(api_key=FINNHUB_TOKEN)

    # Calculate date strings
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    str_to_date = end_date.strftime("%Y-%m-%d")
    str_from_date = start_date.strftime("%Y-%m-%d")

    try:
        # 2. Use asyncio.to_thread to run the synchronous SDK network fetch off the main loop
        # Note: '_from' requires an underscore prefix to prevent native Python keyword collision
        news_items = await asyncio.to_thread(
            finnhub_client.company_news,
            ticker_symbol.upper(),
            _from=str_from_date,
            to=str_to_date,
        )
    except Exception as e:
        print(f"⚠️ Failed to communicate with Finnhub SDK client: {e}")
        return False

    if not news_items:
        print(f"❌ No recent articles found for {ticker_symbol} in the last 7 days.")
        return False

    # Filter to process the first 5 clean news entries
    target_items = news_items[:5]
    articles_indexed_count = 0

    for idx, item in enumerate(target_items):
        title = item.get("headline", "Untitled Financial Report")
        summary = item.get("summary", "")
        article_url = item.get("url", "")

        full_text = summary if len(summary.strip()) > 30 else title
        if len(full_text) < 40:
            continue

        try:
            chunks = recursive_sentence_chunk(full_text, max_chars=800, overlap=100)

            for chunk_idx, chunk in enumerate(chunks):
                doc_id = f"{ticker_symbol}_{idx}_{chunk_idx}"
                collection.upsert(
                    documents=[chunk],
                    metadatas=[
                        {"ticker": ticker_symbol, "title": title, "url": article_url}
                    ],
                    ids=[doc_id],
                )

            articles_indexed_count += 1
            print(
                f"✅ Successfully indexed SDK article {articles_indexed_count}/5: {title}"
            )

        except Exception as e:
            print(f"⚠️ Could not index dataset chunk for {article_url}: {e}")
            continue

    return articles_indexed_count > 0


# ==========================================
# 🛠️ ENDPOINT 1: ASYNC INGEST AND INDEX NEWS
# ==========================================
ingestion_registry = {}


async def async_ingestion_worker(ticker_symbol: str):
    try:
        ingestion_registry[ticker_symbol] = "processing"
        success = await fetch_and_index_expert_news(ticker_symbol)
        if success:
            ingestion_registry[ticker_symbol] = "completed"
        else:
            ingestion_registry[ticker_symbol] = "failed"
    except Exception as e:
        print(f"❌ Background Ingestion Failed for {ticker_symbol}: {e}")
        ingestion_registry[ticker_symbol] = "failed"


@app.post("/api/ingest", status_code=status.HTTP_202_ACCEPTED)
async def trigger_ingestion(ticker: str, background_tasks: BackgroundTasks):
    ticker_symbol = ticker.upper()

    current_status = ingestion_registry.get(ticker_symbol)
    if current_status == "processing":
        return {"status": "processing", "message": "Data ingestion is already running."}

    background_tasks.add_task(async_ingestion_worker, ticker_symbol)

    return {
        "status": "accepted",
        "message": f"Background scraping workers assigned for {ticker_symbol}.",
    }


@app.get("/api/ingest/status/{ticker}")
def get_ingestion_status(ticker: str):
    ticker_symbol = ticker.upper()
    current_status = ingestion_registry.get(ticker_symbol, "idle")
    return {"ticker": ticker_symbol, "status": current_status}


# ==========================================
# 🧠 ENDPOINT 2: RETRIEVE & GENERATE ANSWER
# ==========================================
@app.post("/api/query", response_model=QueryResponse)
def query_pipeline(payload: QueryRequest):
    ticker_symbol = payload.ticker.upper()
    question = payload.question

    results = collection.query(
        query_texts=[question], n_results=3, where={"ticker": ticker_symbol}
    )

    context_documents = results.get("documents", [[]])[0]
    context_metadata = results.get("metadatas", [[]])[0]

    if not context_documents:
        raise HTTPException(
            status_code=404,
            detail=f"No local context chunks found for {ticker_symbol}. Please trigger the ingestion endpoint first.",
        )

    context_str = ""
    sources_list = []
    seen_urls = set()

    for doc, meta in zip(context_documents, context_metadata):
        context_str += f"\n--- Source: {meta['title']} ---\n{doc}\n"
        if meta["url"] not in seen_urls:
            sources_list.append({"title": meta["title"], "url": meta["url"]})
            seen_urls.add(meta["url"])

    system_prompt = (
        "You are a professional financial research analyst. "
        "Your task is to answer the user's question using ONLY the provided expert context snippets. "
        "Structure your response cleanly using Markdown format:\n"
        "- Use bold headings for key insights\n"
        "- Use brief bullet points for catalysts or headwinds\n"
        "- Do NOT hallucinate. If the context does not provide the answer, say 'Insufficient local data.'"
    )
    user_prompt = f"Context Material:\n{context_str}\n\nQuestion: {payload.question}"

    try:
        response = llm_client.chat.completions.create(
            model="local-model",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
        )
        analysis_report = response.choices[0].message.content
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Local LM Studio engine communication error: {str(e)}",
        )

    return {
        "ticker": ticker_symbol,
        "analysis": analysis_report,
        "sources": sources_list,
    }
