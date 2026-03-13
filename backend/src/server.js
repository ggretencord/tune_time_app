const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4010;

app.use(cors());
app.use(express.json());

// In-memory store for survey preferences (per session would be better; this is demo-only)
let latestSurvey = null;

// Helper: call iTunes Search API for tracks
async function searchTracks(query, limit = 20) {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', query);
  url.searchParams.set('media', 'music');
  url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`iTunes search failed with status ${res.status}`);
  }
  const data = await res.json();

  return (data.results || [])
    .filter((r) => r.previewUrl)
    .map((r) => ({
      id: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName,
      artworkUrl: r.artworkUrl100?.replace('100x100', '600x600') || r.artworkUrl100,
      previewUrl: r.previewUrl,
      genre: r.primaryGenreName,
    }));
}

// Search endpoint used by the survey UI to find seed songs
app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter q' });
  }
  try {
    const tracks = await searchTracks(query, 20);
    res.json({ tracks });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Search endpoint error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Save survey: list of seed tracks and selected moods/genres
app.post('/api/survey', (req, res) => {
  const { seeds, moods } = req.body || {};
  if (!Array.isArray(seeds) || seeds.length === 0) {
    return res.status(400).json({ error: 'seeds must be a non-empty array' });
  }
  latestSurvey = {
    seeds,
    moods: Array.isArray(moods) ? moods : [],
    savedAt: Date.now(),
  };
  res.json({ ok: true });
});

// Simple recommendation feed based on latest survey
app.get('/api/feed', async (req, res) => {
  try {
    if (!latestSurvey || !latestSurvey.seeds?.length) {
      // fallback: trending-like generic search
      const fallback = await searchTracks('top hits', 20);
      return res.json({ items: fallback });
    }

    const { seeds, moods } = latestSurvey;
    const baseQueries = [];

    // Build some queries based on seed artists, titles, and optional moods
    seeds.forEach((s) => {
      if (s.artist) baseQueries.push(s.artist);
      if (s.title) baseQueries.push(`${s.title} remix`);
    });
    moods.forEach((m) => baseQueries.push(m));

    if (baseQueries.length === 0) {
      baseQueries.push('chill mix');
    }

    const uniqueTracks = new Map();

    // For each query, grab a few tracks and dedupe by id
    for (const q of baseQueries.slice(0, 6)) {
      const tracks = await searchTracks(q, 10);
      tracks.forEach((t) => {
        if (!uniqueTracks.has(t.id)) {
          uniqueTracks.set(t.id, t);
        }
      });
    }

    // Shuffle for a TikTok-style feed feel
    const items = Array.from(uniqueTracks.values());
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }

    res.json({ items });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Feed endpoint error:', err);
    res.status(500).json({ error: 'Failed to load feed' });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${PORT}`);
});

