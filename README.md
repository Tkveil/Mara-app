# Mara — Sobriety Companion

A real, calm AI companion for sobriety. Built with Next.js, deployed on Vercel.

---

## Deploy in 10 minutes

### Step 1 — Get your Anthropic API key
1. Go to https://console.anthropic.com
2. Sign up / log in
3. Go to **API Keys** → **Create Key**
4. Copy it somewhere safe

### Step 2 — Put the code on GitHub
1. Create a new repo on github.com (call it `mara-app`)
2. In your terminal:
```bash
cd mara
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/mara-app.git
git push -u origin main
```

### Step 3 — Deploy to Vercel
1. Go to https://vercel.com and sign up (free)
2. Click **Add New Project**
3. Import your `mara-app` GitHub repo
4. Before deploying, click **Environment Variables** and add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from Step 1
5. Click **Deploy**

That's it. Vercel gives you a live URL like `mara-app.vercel.app`.

---

## Run locally

```bash
cp .env.local.example .env.local
# Edit .env.local and add your real API key

npm install
npm run dev
# Open http://localhost:3000
```

---

## How it works

- **Frontend** (`pages/index.js`) — the full Mara UI, all data in localStorage
- **Backend** (`pages/api/chat.js`) — one API route that holds your key and proxies to Anthropic
- Users never see your API key — it only lives on the server

---

## Costs

- Vercel hosting: **free** on hobby plan
- Anthropic API: roughly **$0.001–0.003 per conversation** (Haiku model)
- 1,000 users/day ≈ ~$1–3/day in API costs

When you're ready to monetize, add Stripe and gate the `/api/chat` route behind a subscription check.
