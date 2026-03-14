const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4010;
const DEFAULT_VIEWER_ID = 'you';

app.use(cors());
app.use(express.json());

// In-memory store for survey preferences (per session would be better; this is demo-only)
let latestSurvey = null;
let socialMessages = [];

const socialProfiles = new Map([
  [
    'you',
    {
      id: 'you',
      name: 'You',
      handle: 'you',
      bio: 'Building the perfect soundtrack.',
    },
  ],
  [
    'ava',
    {
      id: 'ava',
      name: 'Ava Rivera',
      handle: 'ava_r',
      bio: 'Indie nights and dreamy vocals.',
    },
  ],
  [
    'milo',
    {
      id: 'milo',
      name: 'Milo Grant',
      handle: 'milo_g',
      bio: 'Hip-hop edits and gym energy.',
    },
  ],
  [
    'jules',
    {
      id: 'jules',
      name: 'Jules Tan',
      handle: 'jules_mix',
      bio: 'House, disco, and late-night drives.',
    },
  ],
]);

const socialLikes = new Map();
const socialFollows = new Map([
  ['you', new Set(['ava'])],
  ['ava', new Set()],
  ['milo', new Set()],
  ['jules', new Set()],
]);

function ensureSocialUser(userId) {
  if (!socialProfiles.has(userId)) {
    socialProfiles.set(userId, {
      id: userId,
      name: userId,
      handle: userId.toLowerCase().replace(/\s+/g, ''),
      bio: 'Music fan',
    });
  }
  if (!socialLikes.has(userId)) {
    socialLikes.set(userId, []);
  }
  if (!socialFollows.has(userId)) {
    socialFollows.set(userId, new Set());
  }
}

function toSocialUser(viewerId, profile) {
  ensureSocialUser(viewerId);
  ensureSocialUser(profile.id);
  return {
    ...profile,
    likedMusic: socialLikes.get(profile.id) || [],
    isFollowing: socialFollows.get(viewerId).has(profile.id),
  };
}

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

async function seedSocialLikes() {
  const [avaLikes, miloLikes, julesLikes] = await Promise.all([
    searchTracks('phoebe bridgers', 4),
    searchTracks('drake', 4),
    searchTracks('house music', 4),
  ]);
  socialLikes.set('ava', avaLikes);
  socialLikes.set('milo', miloLikes);
  socialLikes.set('jules', julesLikes);
  socialLikes.set('you', []);
  socialMessages = [
    {
      id: 'msg-1',
      fromId: 'ava',
      toId: 'you',
      text: 'Your liked music list is so good. Any recs?',
      sentAt: Date.now() - 1000 * 60 * 60 * 3,
    },
    {
      id: 'msg-2',
      fromId: 'you',
      toId: 'ava',
      text: 'Try the latest Japanese Breakfast track.',
      sentAt: Date.now() - 1000 * 60 * 60 * 2,
    },
  ];
}

// Social graph and messaging endpoints
app.get('/api/social/users', (req, res) => {
  const viewerId = String(req.query.viewerId || DEFAULT_VIEWER_ID).trim() || DEFAULT_VIEWER_ID;
  ensureSocialUser(viewerId);
  const users = Array.from(socialProfiles.values())
    .filter((profile) => profile.id !== viewerId)
    .map((profile) => toSocialUser(viewerId, profile));
  res.json({ users });
});

app.post('/api/social/follow', (req, res) => {
  const { viewerId, targetId, action } = req.body || {};
  const viewer = String(viewerId || '').trim();
  const target = String(targetId || '').trim();
  if (!viewer || !target || viewer === target) {
    return res.status(400).json({ error: 'viewerId and targetId are required and must differ' });
  }
  ensureSocialUser(viewer);
  ensureSocialUser(target);
  const following = socialFollows.get(viewer);
  if (action === 'unfollow') {
    following.delete(target);
  } else {
    following.add(target);
  }
  return res.json({ ok: true, isFollowing: following.has(target) });
});

app.post('/api/social/like', (req, res) => {
  const { userId, track } = req.body || {};
  const user = String(userId || '').trim();
  if (!user || !track || !track.id) {
    return res.status(400).json({ error: 'userId and valid track are required' });
  }
  ensureSocialUser(user);
  const likes = socialLikes.get(user) || [];
  const exists = likes.some((item) => item.id === String(track.id));
  if (!exists) {
    likes.unshift({
      id: String(track.id),
      title: String(track.title || ''),
      artist: String(track.artist || ''),
      album: track.album ? String(track.album) : undefined,
      artworkUrl: track.artworkUrl ? String(track.artworkUrl) : undefined,
      previewUrl: String(track.previewUrl || ''),
      genre: track.genre ? String(track.genre) : undefined,
    });
    socialLikes.set(user, likes.slice(0, 50));
  }
  return res.json({ ok: true, likedMusic: socialLikes.get(user) });
});

app.get('/api/social/messages', (req, res) => {
  const viewerId = String(req.query.viewerId || '').trim();
  const withUserId = String(req.query.withUserId || '').trim();
  if (!viewerId || !withUserId) {
    return res.status(400).json({ error: 'viewerId and withUserId are required' });
  }
  ensureSocialUser(viewerId);
  ensureSocialUser(withUserId);
  const messages = socialMessages
    .filter(
      (message) =>
        (message.fromId === viewerId && message.toId === withUserId) ||
        (message.fromId === withUserId && message.toId === viewerId)
    )
    .sort((a, b) => a.sentAt - b.sentAt);
  return res.json({ messages });
});

app.post('/api/social/messages', (req, res) => {
  const { fromId, toId, text } = req.body || {};
  const sender = String(fromId || '').trim();
  const recipient = String(toId || '').trim();
  const body = String(text || '').trim();
  if (!sender || !recipient || !body) {
    return res.status(400).json({ error: 'fromId, toId, and text are required' });
  }
  ensureSocialUser(sender);
  ensureSocialUser(recipient);
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromId: sender,
    toId: recipient,
    text: body,
    sentAt: Date.now(),
  };
  socialMessages.push(message);
  if (socialMessages.length > 200) {
    socialMessages = socialMessages.slice(-200);
  }
  return res.json({ ok: true, message });
});

// Fetch plain lyrics and return cleaned text lines
app.get('/api/lyrics', async (req, res) => {
  const artist = String(req.query.artist || '').trim();
  const title = String(req.query.title || '').trim();
  if (!artist || !title) {
    return res.status(400).json({ error: 'artist and title are required' });
  }

  try {
    const url = new URL(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
    );
    const lyricsRes = await fetch(url);
    if (!lyricsRes.ok) {
      return res.json({ lines: [] });
    }

    const payload = await lyricsRes.json();
    const rawLyrics = String(payload.lyrics || '');
    const lines = rawLyrics
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('['));

    return res.json({ lines });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Lyrics endpoint error:', err);
    return res.json({ lines: [] });
  }
});

seedSocialLikes()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed social likes:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  });

