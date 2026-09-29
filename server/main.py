import os
import requests
import yfinance as yf
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException, BackgroundTasks, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from openai import OpenAI
from pathlib import Path

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
class IngestRequest(BaseModel):
    ticker: str


class IngestResponse(BaseModel):
    status: str
    message: str


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
def fetch_and_index_expert_news(ticker_symbol: str) -> bool:
    """Fetches real-time market data, parses the HTML structural elements, and stores them in ChromaDB."""
    print(f"📡 Fetching expert streams for {ticker_symbol} from yfinance...")
    ticker = yf.Ticker(ticker_symbol)
    try:
        news_items = ticker.news
    except Exception as e:
        print(f"⚠️ Failed to talk to yfinance ecosystem: {e}")
        return False

    if not news_items:
        print(f"❌ No recent articles found for {ticker_symbol}")
        return False

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    articles_indexed_count = 0

    for idx, item in enumerate(news_items[:5]):  # Process top 5 most recent articles
        url = item.get("link")
        title = item.get("title")

        try:
            response = requests.get(url, headers=headers, timeout=8)
            if response.status_code != 200:
                continue

            soup = BeautifulSoup(response.content, "lxml")
            for junk in soup(["script", "style", "nav", "footer", "header", "aside"]):
                junk.decompose()

            paragraphs = [
                p.get_text().strip()
                for p in soup.find_all("p")
                if len(p.get_text().strip()) > 40
            ]
            full_text = "\n".join(paragraphs)

            if len(full_text) < 200:
                continue

            chunks = recursive_sentence_chunk(full_text, max_chars=800, overlap=100)

            for chunk_idx, chunk in enumerate(chunks):
                doc_id = f"{ticker_symbol}_{idx}_{chunk_idx}"
                collection.upsert(
                    documents=[chunk],
                    metadatas=[{"ticker": ticker_symbol, "title": title, "url": url}],
                    ids=[doc_id],
                )
            articles_indexed_count += 1
        except Exception as e:
            print(f"⚠️ Could not parse article {url}: {e}")
            continue

    return articles_indexed_count > 0


# ==========================================
# 🛠️ ENDPOINT 1: ASYNC INGEST AND INDEX NEWS
# ==========================================
ingestion_registry = {}


def async_ingestion_worker(ticker_symbol: str):
    try:
        ingestion_registry[ticker_symbol] = "processing"
        success = fetch_and_index_expert_news(ticker_symbol)
        if success:
            ingestion_registry[ticker_symbol] = "completed"
        else:
            ingestion_registry[ticker_symbol] = "failed"
    except Exception as e:
        print(f"❌ Background Ingestion Failed for {ticker_symbol}: {e}")
        ingestion_registry[ticker_symbol] = "failed"


@app.post("/api/ingest", status_code=status.HTTP_202_ACCEPTED)
def trigger_ingestion(payload: IngestRequest, background_tasks: BackgroundTasks):
    ticker_symbol = payload.ticker.upper()

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

    results = collection.query(
        query_texts=[payload.question], n_results=3, where={"ticker": ticker_symbol}
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
