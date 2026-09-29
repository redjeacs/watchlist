import os
import requests
import yfinance as yf
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
from openai import OpenAI

app = FastAPI(title="Financial Watchlist RAG Service")

# 1. Initialization
LM_STUDIO_URL = "http://localhost:1234/v1"

embedding_function = OpenAIEmbeddingFunction(
    api_key="lm-studio",
    api_base=LM_STUDIO_URL,
    model_name="nomic-ai/nomic-embed-text-v1.5-GGF",
)

chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(
    name="expert_stock_analysis", embedding_function=embedding_function
)

llm_client = OpenAI(base_url=LM_STUDIO_URL, api_key="lm-studio")


# 2. Advanced Sentence-Bound Chunking Strategy
def recursive_sentence_chunk(text, max_chars=800, overlap=150):
    """Splits text smoothly on punctuation rather than slicing middle words."""
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
            # Maintain sliding window overlap
            words = current_chunk.split(" ")
            overlap_text = " ".join(words[-15:]) if len(words) > 15 else current_chunk
            current_chunk = overlap_text + " " + sentence

    if current_chunk:
        chunks.append(current_chunk.strip())
    return chunks


# 3. Core Business Ingestion Logic (Bug Fixes Applied)
def fetch_and_index_expert_news(ticker_symbol):
    ticker_symbol = ticker_symbol.upper()
    ticker = yf.Ticker(ticker_symbol)
    news_items = ticker.news

    if not news_items:
        return False

    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

    for idx, item in enumerate(news_items[:5]):
        url = item.get("link")
        title = item.get("title")

        try:
            response = requests.get(url, headers=headers, timeout=10)
            if (
                response.status_code != 200
            ):  # FIXED: response.status_with changed to status_code
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

            # Better chunking applied
            chunks = recursive_sentence_chunk(full_text, max_chars=800, overlap=100)

            for chunk_idx, chunk in enumerate(chunks):
                doc_id = f"{ticker_symbol}_{idx}_{chunk_idx}"
                collection.upsert(
                    documents=[chunk],
                    metadatas=[{"ticker": ticker_symbol, "title": title, "url": url}],
                    ids=[doc_id],
                )
        except Exception as e:
            print(f"⚠️ Error parsing {url}: {e}")
            continue
    return True


# 4. API Request Schema
class QueryRequest(BaseModel):
    ticker: str
    question: str


class IngestRequest(BaseModel):
    ticker: str


# 5. Fast API Broker Microservices
@app.post("/api/ingest")
def trigger_ingestion(payload: IngestRequest):
    success = fetch_and_index_expert_news(payload.ticker)
    if not success:
        raise HTTPException(status_code=404, detail="No new articles gathered.")
    return {
        "status": "success",
        "message": f"Vector indices updated for {payload.ticker}",
    }


@app.post("/api/query")
def query_pipeline(payload: QueryRequest):
    ticker_symbol = payload.ticker.upper()

    results = collection.query(
        query_texts=[payload.question], n_results=3, where={"ticker": ticker_symbol}
    )

    context_documents = results.get("documents", [[]])[0]
    context_metadata = results.get("metadatas", [[]])[0]

    context_str = ""
    for doc, meta in zip(context_documents, context_metadata):
        context_str += f"\n--- Source: {meta['title']} ---\n{doc}\n"

    if not context_str:
        raise HTTPException(
            status_code=404,
            detail="No local contextual data found. Run ingestion first.",
        )

    system_prompt = "You are a professional financial research assistant. Answer using ONLY the context provided."
    user_prompt = f"Context Material:\n{context_str}\n\nQuestion: {payload.question}"

    response = llm_client.chat.completions.create(
        model="local-model",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
    )
    return {"analysis": response.choices[0].message.content}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
