## Tune Time App

A simple full-stack web app that recommends music based on a short survey of songs you like, presented in a vertical, TikTok-style feed with playable audio snippets.

### Stack

- **Backend**: Node.js + Express, proxying the public iTunes Search API to fetch tracks and previews.
- **Frontend**: React + TypeScript (Vite), modern mobile-first UI.

### Getting started

1. **Install dependencies**

   ```bash
   npm install
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Run the app**

   From the project root:

   ```bash
   npm run dev
   ```

   Then open `http://localhost:5173` in your browser.

   - Backend runs on `http://localhost:4010`
   - Frontend runs on `http://localhost:5173`

### How it works

- Start with a **survey**: search and pick a few songs you like and optionally set mood tags.
- The backend uses those seeds to construct search queries against iTunes and returns a **shuffled feed** of recommended tracks with artwork and 30s preview URLs.
- The frontend shows one track per screen in a **music TikTok-style feed**; you can play/pause each snippet and scroll for more.

### Deploy to Railway + GitHub + GoDaddy (`44you.net`)

1. Push this repo to GitHub.
2. In Railway, create a new project from your GitHub repo.
3. Add two services from the same repo:
   - **backend service**
     - Root directory: `backend`
     - Build command: `npm install`
     - Start command: `npm start`
     - Variables:
       - `CORS_ORIGINS=https://44you.net,https://www.44you.net`
   - **frontend service**
     - Root directory: `frontend`
     - Build command: `npm install && npm run build`
     - Start command: `npm start`
     - Variables:
       - `VITE_API_BASE_URL=https://api.44you.net`
4. In Railway, add custom domains:
   - Frontend service: `44you.net` and `www.44you.net`
   - Backend service: `api.44you.net`
5. In GoDaddy DNS for `44you.net`, create:
   - `CNAME` for `www` -> target provided by Railway frontend domain setup.
   - `CNAME` for `api` -> target provided by Railway backend domain setup.
   - For apex/root (`@`), either:
     - use `A/ALIAS/ANAME` records as shown by Railway, or
     - use GoDaddy forwarding from `@` to `https://www.44you.net` if Railway only gives a CNAME target.
6. Wait for DNS to propagate, then verify:
   - `https://44you.net` loads the app.
   - Browser network calls go to `https://api.44you.net/api/...`.

