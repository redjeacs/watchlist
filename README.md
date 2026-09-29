# 📊 Watchlist

A robust, full-stack **Next.js** application designed to track real-time stock movements and generate clean, visual financial reports. By pairing responsive client-side visualizations with isolated server-side api route processors, this platform securely and efficiently aggregates complex market statistics.

## 🌐 Social App Repo
👉 **[View the Completed Project](https://watchlist-beta-five.vercel.app/)**

<p>
  <img width="800" height="450" alt="watchlist demo" src="https://github.com/user-attachments/assets/592dd190-5db8-4337-bf1a-9ab3dcaef795" />
</p>


---

## 🏗️ Architecture & Features

This application bridges live market streams with custom portfolio reporting using a unified serverless environment:

- **Client-Side Interface:** Dynamically re-renders real-time tickers, calculates live profit/loss percentages, and streams price charts using interactive canvas layers.
- **Serverless API Routes:** Server-side handlers natively mapped under `/api` consolidates high-frequency calculations, cache historical analytics, and securely sign outbound requests to external market provider Alpaca.
- **Automated Financial Reports:** Aggregates multi-quarter metrics into inspectable financial tables without sacrificing client performance.

---

## 🛠️ Tech Stack

### 🛡️ Backend API Engine (`/api`)
- **Backend Routing:** NextJs Route handlers
- **Third Party Data Providers:** Alpaca live data stream

### 🎨 Frontend Client Layer (`/client`)
*   **Core UI Engine:** [React](https://react.dev) – Component-driven runtime interface mapping data onto an interactive Virtual DOM.
*   **Charts:** [Recharts](https://recharts.github.io/) – Powers interactive, highly responsive historical stock performance charts and canvas-based financial reporting visuals.
*   **Styling Engine:** HTML5, CSS3, and TailwindCSS ensuring responsive design across desktop, tablet, and mobile displays.

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
```

### 4. Launch the Local Development Servers
```bash
# run your development script
npm run dev
```
Open your browser and navigate to `http://localhost:3000`.

---
