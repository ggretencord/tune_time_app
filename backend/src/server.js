const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 4010;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PHOTO_CLIP_PREVIEW_SECONDS = 30;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

app.use(cors());
app.use(express.json({ limit: '8mb' }));

// In-memory store for survey preferences, scoped per user.
const latestSurveyByUser = new Map();
let socialMessages = [];
let socialPhotoPosts = [];

const socialProfiles = new Map([
  [
    'you',
    {
      id: 'you',
      name: 'You',
      handle: 'you',
      bio: 'Building the perfect soundtrack.',
      birthday: '1999-06-15',
      gender: 'would rather not say',
      matchOpen: true,
      profileImageUrl:
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=800&q=80',
    },
  ],
  [
    'ava',
    {
      id: 'ava',
      name: 'Ava Rivera',
      handle: 'ava_r',
      bio: 'Indie nights and dreamy vocals.',
      birthday: '1998-02-03',
      gender: 'female',
      matchOpen: true,
      profileImageUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80',
    },
  ],
  [
    'milo',
    {
      id: 'milo',
      name: 'Milo Grant',
      handle: 'milo_g',
      bio: 'Hip-hop edits and gym energy.',
      birthday: '1996-10-28',
      gender: 'male',
      matchOpen: false,
      profileImageUrl:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80',
    },
  ],
  [
    'jules',
    {
      id: 'jules',
      name: 'Jules Tan',
      handle: 'jules_mix',
      bio: 'House, disco, and late-night drives.',
      birthday: '2001-01-11',
      gender: 'would rather not say',
      matchOpen: true,
      profileImageUrl:
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
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
const sessions = new Map();
const ALLOWED_GENDERS = new Set(['male', 'female', 'would rather not say']);

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { userId, expiresAt });
  return token;
}

function extractToken(req) {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return '';
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const session = sessions.get(token);
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  req.authToken = token;
  req.authUserId = session.userId;
  return next();
}

function initializeSeedPasswords() {
  for (const profile of socialProfiles.values()) {
    if (!profile.passwordHash) {
      profile.passwordHash = hashPassword('password123');
    }
  }
}

function ensureSocialUser(userId) {
  if (!socialProfiles.has(userId)) {
    socialProfiles.set(userId, {
      id: userId,
      name: userId,
      handle: userId.toLowerCase().replace(/\s+/g, ''),
      bio: 'Music fan',
      birthday: '2000-01-01',
      gender: 'would rather not say',
      matchOpen: true,
      profileImageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(userId)}&background=111827&color=f9f7ff`,
      passwordHash: hashPassword('password123'),
    });
  }
  if (!socialLikes.has(userId)) {
    socialLikes.set(userId, []);
  }
  if (!socialFollows.has(userId)) {
    socialFollows.set(userId, new Set());
  }
}

function normalizePhotoPostClip(clip) {
  if (!clip || typeof clip !== 'object') return null;
  const id = String(clip.id || '').trim();
  const title = String(clip.title || '').trim();
  const artist = String(clip.artist || '').trim();
  const previewUrl = String(clip.previewUrl || '').trim();
  if (!id || !title || !artist || !previewUrl) return null;
  const album = String(clip.album || '').trim();
  const rawStart = Number(clip.startTime);
  const safeStartRaw = Number.isFinite(rawStart) ? rawStart : 0;
  const startTime = Math.max(0, Math.min(PHOTO_CLIP_PREVIEW_SECONDS - 1, safeStartRaw));
  const rawDuration = Number(clip.duration);
  const safeDurationRaw = Number.isFinite(rawDuration) ? rawDuration : 15;
  const duration = Math.max(5, Math.min(PHOTO_CLIP_PREVIEW_SECONDS - startTime, safeDurationRaw));
  return {
    id,
    title: title.slice(0, 160),
    artist: artist.slice(0, 140),
    album: album ? album.slice(0, 140) : undefined,
    previewUrl,
    startTime,
    duration,
  };
}

function detectImageMimeType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function isSkinPixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (r < 80 || g < 35 || b < 20) return false;
  if (max - min < 12) return false;
  if (!(r > g && r > b)) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}

async function isLikelyNudeImage(buffer) {
  const prepared = await sharp(buffer)
    .rotate()
    .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = prepared;
  const width = info.width;
  const height = info.height;
  if (!width || !height || width < 64 || height < 64) return true;

  let skinPixels = 0;
  let centerSkinPixels = 0;
  const totalPixels = width * height;
  const centerLeft = Math.floor(width * 0.2);
  const centerRight = Math.ceil(width * 0.8);
  const centerTop = Math.floor(height * 0.2);
  const centerBottom = Math.ceil(height * 0.8);
  const centerPixels = Math.max(1, (centerRight - centerLeft) * (centerBottom - centerTop));

  for (let i = 0; i < data.length; i += info.channels) {
    const pixelIndex = i / info.channels;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (isSkinPixel(data[i], data[i + 1], data[i + 2])) {
      skinPixels += 1;
      if (x >= centerLeft && x < centerRight && y >= centerTop && y < centerBottom) {
        centerSkinPixels += 1;
      }
    }
  }

  const skinRatio = skinPixels / totalPixels;
  const centerSkinRatio = centerSkinPixels / centerPixels;
  return skinRatio > 0.45 || centerSkinRatio > 0.52;
}

async function validateAndModerateImageData(imageData, fieldName) {
  const raw = String(imageData || '').trim();
  if (!raw) return { ok: false, error: `${fieldName} is required` };

  const dataUrlMatch = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!dataUrlMatch) {
    return { ok: false, error: `${fieldName} must be a base64 data URL (jpeg/png/webp only)` };
  }
  const mimeType = dataUrlMatch[1].toLowerCase();
  const base64Data = dataUrlMatch[2];
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    return { ok: false, error: 'Only jpeg, png, and webp images are allowed' };
  }

  let imageBuffer;
  try {
    imageBuffer = Buffer.from(base64Data, 'base64');
  } catch {
    return { ok: false, error: 'Image data is invalid base64' };
  }
  if (!imageBuffer.length || imageBuffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image must be between 1 byte and 5MB' };
  }

  const sniffedMimeType = detectImageMimeType(imageBuffer);
  if (!sniffedMimeType || sniffedMimeType !== mimeType) {
    return { ok: false, error: 'Image content does not match the declared file type' };
  }

  try {
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 64 || metadata.height < 64) {
      return { ok: false, error: 'Image must be at least 64x64 pixels' };
    }
    if (metadata.width > 5000 || metadata.height > 5000) {
      return { ok: false, error: 'Image dimensions are too large' };
    }
  } catch {
    return { ok: false, error: 'Could not process image' };
  }

  try {
    if (await isLikelyNudeImage(imageBuffer)) {
      return {
        ok: false,
        error: 'Image was rejected by safety checks. Nude photos are not allowed.',
      };
    }
  } catch {
    return { ok: false, error: 'Image moderation failed. Please try a different image.' };
  }

  return { ok: true, value: raw };
}

function getAgeFromBirthday(birthday) {
  const birthDate = new Date(birthday);
  if (Number.isNaN(birthDate.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age >= 0 ? age : null;
}

function isMutualMatch(viewerProfile, targetProfile, viewerFollowsTarget, targetFollowsViewer) {
  return (
    viewerFollowsTarget &&
    targetFollowsViewer &&
    Boolean(viewerProfile?.matchOpen) &&
    Boolean(targetProfile?.matchOpen)
  );
}

function toViewerAccount(profile) {
  ensureSocialUser(profile.id);
  return {
    id: profile.id,
    name: profile.name,
    handle: profile.handle,
    bio: profile.bio,
    age: getAgeFromBirthday(profile.birthday),
    gender: ALLOWED_GENDERS.has(String(profile.gender || '').toLowerCase())
      ? String(profile.gender).toLowerCase()
      : 'would rather not say',
    matchOpen: Boolean(profile.matchOpen),
    profileImageUrl: String(profile.profileImageUrl || ''),
    likedMusic: socialLikes.get(profile.id) || [],
  };
}

function toSocialUser(viewerId, profile) {
  ensureSocialUser(viewerId);
  ensureSocialUser(profile.id);
  const viewerProfile = socialProfiles.get(viewerId);
  const viewerFollowsTarget = socialFollows.get(viewerId).has(profile.id);
  const targetFollowsViewer = socialFollows.get(profile.id).has(viewerId);
  const isMutualFollow = viewerFollowsTarget && targetFollowsViewer;
  return {
    id: profile.id,
    name: profile.name,
    handle: profile.handle,
    bio: profile.bio,
    age: viewerFollowsTarget ? getAgeFromBirthday(profile.birthday) : null,
    gender: ALLOWED_GENDERS.has(String(profile.gender || '').toLowerCase())
      ? String(profile.gender).toLowerCase()
      : 'would rather not say',
    matchOpen: Boolean(profile.matchOpen),
    profileImageUrl: String(profile.profileImageUrl || ''),
    isMatched: isMutualMatch(
      viewerProfile,
      profile,
      viewerFollowsTarget,
      targetFollowsViewer
    ),
    likedMusic: socialLikes.get(profile.id) || [],
    isFollowing: viewerFollowsTarget,
    followsYou: targetFollowsViewer,
    isMutualFollow,
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
app.post('/api/survey', requireAuth, (req, res) => {
  const { seeds, moods } = req.body || {};
  const userId = req.authUserId;
  const normalizedSeeds = Array.isArray(seeds)
    ? seeds
        .filter((seed) => seed && seed.id)
        .map((seed) => ({
          id: String(seed.id),
          title: String(seed.title || ''),
          artist: String(seed.artist || ''),
        }))
    : [];
  const normalizedMoods = Array.isArray(moods)
    ? moods.map((mood) => String(mood || '').trim()).filter(Boolean)
    : [];

  if (!normalizedSeeds.length && !normalizedMoods.length) {
    // Empty submit means "use my listening history".
    latestSurveyByUser.delete(userId);
    return res.json({ ok: true });
  }

  latestSurveyByUser.set(userId, {
    seeds: normalizedSeeds,
    moods: normalizedMoods,
    savedAt: Date.now(),
  });
  res.json({ ok: true });
});

app.post('/api/account/register', async (req, res) => {
  const { name, handle, bio, birthday, gender, matchOpen, password, profileImageData } = req.body || {};
  const cleanedName = String(name || '').trim();
  const cleanedHandle = String(handle || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  const cleanedBio = String(bio || '').trim();
  const cleanedBirthday = String(birthday || '').trim();
  const cleanedGender = String(gender || '')
    .trim()
    .toLowerCase();
  const cleanedPassword = String(password || '');

  if (!cleanedName || !cleanedHandle || !cleanedBirthday || !cleanedPassword || !cleanedGender) {
    return res
      .status(400)
      .json({ error: 'name, handle, birthday, gender, and password are required' });
  }
  if (!ALLOWED_GENDERS.has(cleanedGender)) {
    return res.status(400).json({ error: 'gender must be male, female, or would rather not say' });
  }
  if (cleanedPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const birthDate = new Date(cleanedBirthday);
  if (Number.isNaN(birthDate.getTime())) {
    return res.status(400).json({ error: 'birthday must be a valid date' });
  }
  const age = getAgeFromBirthday(cleanedBirthday);
  if (age === null || age < 13) {
    return res.status(400).json({ error: 'You must be at least 13 years old' });
  }
  const moderation = await validateAndModerateImageData(profileImageData, 'profileImageData');
  if (!moderation.ok) {
    return res.status(400).json({ error: moderation.error });
  }
  const taken = Array.from(socialProfiles.values()).some(
    (profile) => profile.handle === cleanedHandle
  );
  if (taken) {
    return res.status(409).json({ error: 'That handle is already taken' });
  }

  const userId = `user_${Date.now().toString(36)}`;
  socialProfiles.set(userId, {
    id: userId,
    name: cleanedName,
    handle: cleanedHandle,
    bio: cleanedBio || 'Music fan',
    birthday: cleanedBirthday,
    gender: cleanedGender,
    matchOpen: matchOpen !== false,
    profileImageUrl: moderation.value,
    passwordHash: hashPassword(cleanedPassword),
  });
  ensureSocialUser(userId);

  const sessionToken = createSession(userId);
  return res.status(201).json({ user: toViewerAccount(socialProfiles.get(userId)), sessionToken });
});

app.post('/api/account/profile-photo', requireAuth, async (req, res) => {
  const { profileImageData } = req.body || {};
  const userId = req.authUserId;
  const profile = socialProfiles.get(userId);
  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }
  const moderation = await validateAndModerateImageData(profileImageData, 'profileImageData');
  if (!moderation.ok) {
    return res.status(400).json({ error: moderation.error });
  }
  profile.profileImageUrl = moderation.value;
  socialProfiles.set(userId, profile);
  return res.json({ ok: true, user: toViewerAccount(profile) });
});

app.post('/api/account/login', (req, res) => {
  const { handle, password } = req.body || {};
  const cleanedHandle = String(handle || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  const cleanedPassword = String(password || '');
  if (!cleanedHandle || !cleanedPassword) {
    return res.status(400).json({ error: 'handle and password are required' });
  }

  const profile = Array.from(socialProfiles.values()).find(
    (candidate) => candidate.handle === cleanedHandle
  );
  if (!profile) {
    return res.status(404).json({ error: 'No account found for that handle' });
  }
  if (!verifyPassword(cleanedPassword, profile.passwordHash)) {
    return res.status(401).json({ error: 'Invalid handle or password' });
  }

  ensureSocialUser(profile.id);
  const sessionToken = createSession(profile.id);
  return res.json({ user: toViewerAccount(profile), sessionToken });
});

app.get('/api/account/session', requireAuth, (req, res) => {
  const profile = socialProfiles.get(req.authUserId);
  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json({ user: toViewerAccount(profile) });
});

app.post('/api/account/logout', requireAuth, (req, res) => {
  sessions.delete(req.authToken);
  return res.json({ ok: true });
});

app.post('/api/account/match-mode', requireAuth, (req, res) => {
  const { matchOpen } = req.body || {};
  const user = req.authUserId;
  const profile = socialProfiles.get(user);
  profile.matchOpen = Boolean(matchOpen);
  socialProfiles.set(user, profile);
  return res.json({ ok: true, matchOpen: profile.matchOpen });
});

app.get('/api/account/profile', requireAuth, (req, res) => {
  const userId = req.authUserId;
  if (!socialProfiles.has(userId)) {
    return res.status(404).json({ error: 'User not found' });
  }
  const profile = socialProfiles.get(userId);
  return res.json({ user: toViewerAccount(profile) });
});

// Simple recommendation feed based on survey or prior likes
app.get('/api/feed', requireAuth, async (req, res) => {
  try {
    const userId = req.authUserId;
    const survey = latestSurveyByUser.get(userId);
    const likedTracks = socialLikes.get(userId) || [];
    const baseQueries = [];

    if (survey) {
      const { seeds, moods } = survey;
      // Build some queries based on seed artists, titles, and optional moods.
      seeds.forEach((s) => {
        if (s.artist) baseQueries.push(s.artist);
        if (s.title) baseQueries.push(`${s.title} remix`);
      });
      moods.forEach((m) => baseQueries.push(m));
    } else {
      // If the user skipped survey choices, use previous likes as fallback.
      likedTracks.slice(0, 10).forEach((track) => {
        if (track.artist) baseQueries.push(track.artist);
        if (track.title) baseQueries.push(`${track.title} similar`);
        if (track.genre) baseQueries.push(track.genre);
      });
    }

    if (baseQueries.length === 0) {
      // Final fallback for brand new users with no survey and no likes.
      const fallback = await searchTracks('top hits', 20);
      return res.json({ items: fallback });
    }

    const uniqueQueries = [...new Set(baseQueries.map((query) => query.trim()).filter(Boolean))];
    const uniqueTracks = new Map();

    // For each query, grab a few tracks and dedupe by id.
    for (const q of uniqueQueries.slice(0, 6)) {
      const tracks = await searchTracks(q, 10);
      tracks.forEach((t) => {
        if (!uniqueTracks.has(t.id)) {
          uniqueTracks.set(t.id, t);
        }
      });
    }

    // If recs came up empty, fall back to a generic query.
    if (!uniqueTracks.size) {
      const fallback = await searchTracks('top hits', 20);
      return res.json({ items: fallback });
    }

    // Shuffle for a TikTok-style feed feel.
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
  socialPhotoPosts = [
    {
      id: 'photo-seed-ava',
      authorId: 'ava',
      imageUrl:
        'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=900&q=80',
      caption: 'Late-night record store run.',
      createdAt: Date.now() - 1000 * 60 * 50,
    },
    {
      id: 'photo-seed-jules',
      authorId: 'jules',
      imageUrl:
        'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80',
      caption: 'Pre-set playlist locked in.',
      createdAt: Date.now() - 1000 * 60 * 20,
    },
  ];
}

// Social graph and messaging endpoints
app.get('/api/social/users', requireAuth, (req, res) => {
  const viewerId = req.authUserId;
  ensureSocialUser(viewerId);
  const users = Array.from(socialProfiles.values())
    .filter((profile) => profile.id !== viewerId)
    .map((profile) => toSocialUser(viewerId, profile));
  res.json({ users });
});

app.post('/api/social/follow', requireAuth, (req, res) => {
  const { targetId, action } = req.body || {};
  const viewer = req.authUserId;
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
  const viewerProfile = socialProfiles.get(viewer);
  const targetProfile = socialProfiles.get(target);
  const targetFollowsViewer = socialFollows.get(target).has(viewer);
  const isFollowing = following.has(target);
  return res.json({
    ok: true,
    isFollowing,
    followsYou: targetFollowsViewer,
    isMutualFollow: isFollowing && targetFollowsViewer,
    isMatched: isMutualMatch(
      viewerProfile,
      targetProfile,
      isFollowing,
      targetFollowsViewer
    ),
  });
});

app.post('/api/social/like', requireAuth, (req, res) => {
  const { track } = req.body || {};
  const user = req.authUserId;
  if (!user || !track || !track.id) {
    return res.status(400).json({ error: 'A valid track is required' });
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

app.get('/api/social/messages', requireAuth, (req, res) => {
  const viewerId = req.authUserId;
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

app.post('/api/social/messages', requireAuth, (req, res) => {
  const { toId, text, track } = req.body || {};
  const sender = req.authUserId;
  const recipient = String(toId || '').trim();
  const body = String(text || '').trim();
  const normalizedTrack =
    track && track.id
      ? {
          id: String(track.id),
          title: String(track.title || ''),
          artist: String(track.artist || ''),
          album: track.album ? String(track.album) : undefined,
          artworkUrl: track.artworkUrl ? String(track.artworkUrl) : undefined,
          previewUrl: String(track.previewUrl || ''),
          genre: track.genre ? String(track.genre) : undefined,
        }
      : null;
  if (!sender || !recipient || (!body && !normalizedTrack)) {
    return res.status(400).json({ error: 'toId and either text or track are required' });
  }
  if (normalizedTrack && (!normalizedTrack.title || !normalizedTrack.artist)) {
    return res.status(400).json({ error: 'track must include id, title, and artist' });
  }
  ensureSocialUser(sender);
  ensureSocialUser(recipient);
  const senderProfile = socialProfiles.get(sender);
  const recipientProfile = socialProfiles.get(recipient);
  const senderFollowsRecipient = socialFollows.get(sender).has(recipient);
  const recipientFollowsSender = socialFollows.get(recipient).has(sender);
  const canMessage = isMutualMatch(
    senderProfile,
    recipientProfile,
    senderFollowsRecipient,
    recipientFollowsSender
  );
  if (!canMessage) {
    return res
      .status(403)
      .json({ error: 'Messaging is available only when both users are matched and match is open' });
  }
  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromId: sender,
    toId: recipient,
    text: body || (normalizedTrack ? `Shared a song: ${normalizedTrack.title} - ${normalizedTrack.artist}` : ''),
    sharedTrack: normalizedTrack,
    sentAt: Date.now(),
  };
  socialMessages.push(message);
  if (socialMessages.length > 200) {
    socialMessages = socialMessages.slice(-200);
  }
  return res.json({ ok: true, message });
});

function canViewPhotoPosts(viewerId, authorId) {
  if (viewerId === authorId) return true;
  ensureSocialUser(viewerId);
  ensureSocialUser(authorId);
  return socialFollows.get(viewerId).has(authorId);
}

app.get('/api/social/photo-posts', requireAuth, (req, res) => {
  const viewerId = req.authUserId;
  const requestedAuthorId = String(req.query.authorId || '').trim();
  const posts = socialPhotoPosts
    .filter((post) => {
      if (requestedAuthorId && post.authorId !== requestedAuthorId) return false;
      return canViewPhotoPosts(viewerId, post.authorId);
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((post) => {
      const author = socialProfiles.get(post.authorId);
      return {
        ...post,
        author: author
          ? {
              id: author.id,
              name: author.name,
              handle: author.handle,
              profileImageUrl: String(author.profileImageUrl || ''),
            }
          : null,
      };
    });
  return res.json({ posts });
});

app.post('/api/social/photo-posts', requireAuth, async (req, res) => {
  const { imageData, caption, clip } = req.body || {};
  const authorId = req.authUserId;
  const cleanedCaption = String(caption || '').trim().slice(0, 180);
  const normalizedClip = normalizePhotoPostClip(clip);
  if (clip && !normalizedClip) {
    return res.status(400).json({ error: 'Clip must include id, title, artist, and previewUrl' });
  }
  const author = socialProfiles.get(authorId);
  if (!author) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!author.profileImageUrl) {
    return res.status(403).json({ error: 'You must set a profile photo before posting' });
  }
  const moderation = await validateAndModerateImageData(imageData, 'imageData');
  if (!moderation.ok) {
    return res.status(400).json({ error: moderation.error });
  }
  const post = {
    id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    authorId,
    imageUrl: moderation.value,
    caption: cleanedCaption,
    clip: normalizedClip,
    createdAt: Date.now(),
  };
  socialPhotoPosts.unshift(post);
  if (socialPhotoPosts.length > 400) {
    socialPhotoPosts = socialPhotoPosts.slice(0, 400);
  }
  return res.status(201).json({
    ok: true,
    post: {
      ...post,
      author: {
        id: author.id,
        name: author.name,
        handle: author.handle,
        profileImageUrl: String(author.profileImageUrl || ''),
      },
    },
  });
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

initializeSeedPasswords();

seedSocialLikes()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed social likes:', err);
  })
  .finally(() => {
    app.use('/api', (req, res) => {
      return res.status(404).json({ error: 'API route not found' });
    });

    app.use((err, req, res, next) => {
      if (res.headersSent) return next(err);
      if (err?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large (max 8MB)' });
      }
      // eslint-disable-next-line no-console
      console.error('Unhandled API error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    });

    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Backend listening on http://localhost:${PORT}`);
    });
  });

