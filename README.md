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

   - Backend runs on `http://localhost:4000`
   - Frontend runs on `http://localhost:5173`

### How it works

- Start with a **survey**: search and pick a few songs you like and optionally set mood tags.
- The backend uses those seeds to construct search queries against iTunes and returns a **shuffled feed** of recommended tracks with artwork and 30s preview URLs.
- The frontend shows one track per screen in a **music TikTok-style feed**; you can play/pause each snippet and scroll for more.

