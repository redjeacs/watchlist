# 📊 Watchlist

A full-stack **Next.js** application designed to track stocks and analyze financial data using a dual-pipeline **AI Analysis Engine** combining cloud and local models.

## 🌐 Social App Repo
👉 **[View the Completed Project](https://watchlist-beta-five.vercel.app/)**

<p>
  <img width="800" height="450" alt="watchlist demo" src="https://github.com/user-attachments/assets/592dd190-5db8-4337-bf1a-9ab3dcaef795" />
</p>

---

## 🏗️ Architecture & Features

- **Dual-Pipeline AI Analysis Engine:**
  * **Cloud Intelligence Pipeline:** Fetches market news from Finnhub, parses data via **Cheerio**, and utilizes **Google Gemini 3.6** for processing.
  * **Local RAG & Storage Pipeline:** Runs an isolated Python server utilizing **LM Studio** and **Pinecone** for vector storage and local querying.
- **Client-Side Interface & API:** Features interactive charts, live profit/loss metrics, and Next.js serverless API routes.
- - **Automated Financial Reports:** Aggregates multi-quarter metrics from the SEC api into inspectable financial tables without sacrificing client performance.

---

## 🛠️ Tech Stack

### 🛡️ Backend API Engine (`/api`)
- **Backend Routing:** NextJs Route handlers
- **Third Party Data Providers:** Alpaca live data stream

### 🎨 Frontend Client Layer (`/client`)
*   **Core UI Engine:** [React](https://react.dev) – Component-driven runtime interface mapping data onto an interactive Virtual DOM.
*   **Charts:** [Recharts](https://recharts.github.io/) – Powers interactive, highly responsive historical stock performance charts and canvas-based financial reporting visuals.
*   **Styling Engine:** HTML5, CSS3, and TailwindCSS ensuring responsive design across desktop, tablet, and mobile displays.

### Hybrid AI & Core Stack
* **Cloud AI:** Google Gemini 3.6 & Cheerio for scraping Finnhub market news in NextJs Route.
* **Local AI/RAG:** LM Studio, isolated Python server, and Pinecone vector database.

---

## 💻 Local Installation & Setup

Follow these steps to run this application locally on your computer:

### 1. Clone the Repository
```bash
git clone https://github.comd/redjeacs/watchlist
cd watchlist
```

### 2. Install Project Dependencies
```bash
npm install
```

### 3. Setup Your Environment Variables
Create a file named `.env.local` in the directory of your project and configure your local or cloud keys:

/api
```env
# Alpaca API Credentials (create an account for free to access api data)

ALPACA_API_KEY='[YOUR_API_KEY]'
ALPACA_API_SECRET='[YOUR_API_SECRET]'
FINNHUB_API_KEY='[YOUR_FINNHUB_API_KEY]'
GEMINI_API_KEY='[YOUR_GEMINI_API_KEY]'
PINECONE_API_KEY='[YOUR_PINECONE_API_KEY]'
PINECONE_INDEX='[YOUR_PINECONE_INDEX]'
```

### 4. Launch the Local Development Servers
```bash
# run your development script
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

---
