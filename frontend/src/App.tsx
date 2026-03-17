import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import './App.css'

type Track = {
  id: string
  title: string
  artist: string
  album?: string
  artworkUrl?: string
  previewUrl: string
  genre?: string
}

type PhotoPostClip = {
  id: string
  title: string
  artist: string
  album?: string
  previewUrl: string
  startTime: number
  duration: number
}

type SurveySeed = {
  id: string
  title: string
  artist: string
  genre?: string
}

type TimedLyricLine = {
  text: string
  startTime: number
  endTime: number
}

type SocialUser = {
  id: string
  name: string
  handle: string
  bio: string
  age: number | null
  gender: DatingGenderOption
  matchOpen: boolean
  profileImageUrl: string
  isMatched: boolean
  likedMusic: Track[]
  isFollowing: boolean
  followsYou: boolean
  isMutualFollow: boolean
}

type ChatMessage = {
  id: string
  fromId: string
  toId: string
  text: string
  sentAt: number
  sharedTrack?: Track
}

type ViewerAccount = {
  id: string
  name: string
  handle: string
  bio: string
  age: number
  gender: DatingGenderOption
  matchOpen: boolean
  profileImageUrl: string
  likedMusic: Track[]
}

type CompatibilityBreakdown = {
  score: number
  sharedTracks: Track[]
  sharedArtists: string[]
  sharedMoods: string[]
  ageDelta: number | null
  matchOpenBoost: number
}

type DatingAgeFilter = 'all' | '18-24' | '25-30' | '31-38' | '39+'
type DatingGenderOption = 'male' | 'female' | 'would rather not say'
type DatingGenderFilter = 'all' | DatingGenderOption

type PhotoPost = {
  id: string
  authorId: string
  imageUrl: string
  caption: string
  clip?: PhotoPostClip | null
  createdAt: number
  author: {
    id: string
    name: string
    handle: string
    profileImageUrl: string
  } | null
}

type ProfileSummary = {
  id: string
  name: string
  handle: string
  profileImageUrl: string
}

type ProfileMessage = ChatMessage & {
  withUser: ProfileSummary | null
}

type SocialProfileDetails = {
  profile: SocialUser
  posts: PhotoPost[]
  matches: ProfileSummary[]
  messages: ProfileMessage[]
}

type PhotoFilterPreset = 'none' | 'vivid' | 'noir' | 'vintage' | 'cool' | 'dreamy'
type PhotoOverlayPreset = 'none' | 'sunset' | 'ocean' | 'midnight' | 'rose'

type PhotoMarkupPoint = {
  x: number
  y: number
}

type PhotoMarkupStroke = {
  id: string
  color: string
  size: number
  points: PhotoMarkupPoint[]
}

const PHOTO_FILTER_PRESETS: Array<{ id: PhotoFilterPreset; label: string; filter: string }> = [
  { id: 'none', label: 'Original', filter: 'none' },
  { id: 'vivid', label: 'Vivid', filter: 'contrast(1.2) saturate(1.35) brightness(1.05)' },
  { id: 'noir', label: 'Noir', filter: 'grayscale(1) contrast(1.25) brightness(0.9)' },
  { id: 'vintage', label: 'Vintage', filter: 'sepia(0.5) contrast(1.06) saturate(0.92)' },
  { id: 'cool', label: 'Cool', filter: 'hue-rotate(12deg) saturate(1.08) brightness(1.03)' },
  { id: 'dreamy', label: 'Dreamy', filter: 'saturate(1.18) brightness(1.08) blur(0.4px)' },
]

const PHOTO_OVERLAY_PRESETS: Array<{
  id: PhotoOverlayPreset
  label: string
  stops: [string, string, string]
}> = [
  { id: 'none', label: 'None', stops: ['transparent', 'transparent', 'transparent'] },
  { id: 'sunset', label: 'Sunset', stops: ['rgba(255, 125, 92, 0.55)', 'rgba(255, 96, 160, 0.35)', 'rgba(67, 35, 148, 0.45)'] },
  { id: 'ocean', label: 'Ocean', stops: ['rgba(50, 186, 223, 0.5)', 'rgba(32, 110, 218, 0.38)', 'rgba(9, 42, 122, 0.44)'] },
  { id: 'midnight', label: 'Midnight', stops: ['rgba(51, 25, 104, 0.44)', 'rgba(22, 42, 108, 0.46)', 'rgba(10, 17, 48, 0.6)'] },
  { id: 'rose', label: 'Rose', stops: ['rgba(255, 142, 214, 0.55)', 'rgba(252, 98, 149, 0.42)', 'rgba(92, 12, 75, 0.45)'] },
]

const PHOTO_CLIP_PREVIEW_SECONDS = 30

const PRODUCTION_API_BASE_URL = 'https://backend-production-90ab.up.railway.app'
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? PRODUCTION_API_BASE_URL : '')
).replace(/\/$/, '')
const SESSION_STORAGE_KEY = 'tune_time_session_token'
const DATING_MOOD_OPTIONS = ['chill', 'hype', 'sad', 'focus', 'party', 'romantic'] as const
const DATING_GENDER_OPTIONS: DatingGenderOption[] = ['male', 'female', 'would rather not say']

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatSeconds(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image'))
    image.src = dataUrl
  })
}

function getSurveyStorageKey(userId: string) {
  return `tune_time_survey_complete_${userId}`
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Could not read image file'))
    }
    reader.onerror = () => reject(new Error('Could not read image file'))
    reader.readAsDataURL(file)
  })
}

async function parseResponseJsonSafe<T>(res: Response): Promise<T | null> {
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return null
  }
  try {
    return (await res.clone().json()) as T
  } catch {
    return null
  }
}

async function readApiErrorMessage(res: Response, fallback: string) {
  const parsed = await parseResponseJsonSafe<{ error?: string }>(res)
  if (parsed?.error) return parsed.error
  try {
    const text = await res.clone().text()
    if (text && !text.trim().startsWith('<')) {
      return text.slice(0, 180)
    }
  } catch {
    // Ignore text extraction issues and use fallback.
  }
  return fallback
}

function uniqueLowercase(values: string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
}

function TuneTimeLogo({ size = 30 }: { size?: number }) {
  const gradId = useId()
  const bgId = `${gradId}-bg`
  const uId = `${gradId}-u`

  return (
    <svg
      className="brand-logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={bgId} x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#84dfff" />
          <stop offset="0.33" stopColor="#baf4ff" />
          <stop offset="0.68" stopColor="#ffd3ef" />
          <stop offset="1" stopColor="#ff88ca" />
        </linearGradient>
        <linearGradient id={uId} x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff0f9f" />
          <stop offset="0.42" stopColor="#ff0f9f" />
          <stop offset="0.58" stopColor="#173a9f" />
          <stop offset="1" stopColor="#173a9f" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="18" fill={`url(#${bgId})`} />
      <rect x="4" y="4" width="56" height="56" rx="18" fill="none" stroke="#173a9f" strokeWidth="1.8" />
      <rect x="5.2" y="5.2" width="53.6" height="53.6" rx="16.8" fill="none" stroke="#ffffff" strokeOpacity="0.35" />
      <path
        d="M16 12v24c0 9 7 17 16 17s16-8 16-17V12"
        fill="none"
        stroke={`url(#${uId})`}
        strokeWidth="6.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="32"
        y="28.8"
        textAnchor="middle"
        fill="#173a9f"
        fontSize="22"
        fontWeight="700"
        fontFamily="'Bodoni MT', 'Didot', 'Times New Roman', serif"
      >
        4
      </text>
      <text
        x="32"
        y="44.8"
        textAnchor="middle"
        fill="#ff1ea8"
        fontSize="22"
        fontWeight="700"
        fontFamily="'Bodoni MT', 'Didot', 'Times New Roman', serif"
      >
        4
      </text>
    </svg>
  )
}

function BrandLockup() {
  return (
    <span className="brand-lockup">
      <TuneTimeLogo />
      <span className="brand">
        <span className="brand-four brand-four-blue">4</span>/
        <span className="brand-four brand-four-pink">4</span> you
      </span>
    </span>
  )
}

function inferMoodsFromTracks(tracks: Track[]) {
  const moods = new Set<string>()
  for (const track of tracks) {
    const source = `${track.genre || ''} ${track.title} ${track.artist}`.toLowerCase()
    if (/(lofi|ambient|indie|acoustic|chill|downtempo|soft)/.test(source)) moods.add('chill')
    if (/(edm|dance|trap|drill|house|club|hype|rage)/.test(source)) moods.add('hype')
    if (/(sad|ballad|blues|melancholy|heartbreak|emo)/.test(source)) moods.add('sad')
    if (/(focus|instrumental|study|classical|piano|jazz)/.test(source)) moods.add('focus')
    if (/(party|reggaeton|afrobeats|pop|latin|festival)/.test(source)) moods.add('party')
    if (/(romantic|love|rnb|soul|slow jam|serenade)/.test(source)) moods.add('romantic')
  }
  return moods
}

function matchesDatingAgeFilter(age: number | null, filter: DatingAgeFilter) {
  if (filter === 'all') return true
  if (age === null) return false
  if (filter === '18-24') return age >= 18 && age <= 24
  if (filter === '25-30') return age >= 25 && age <= 30
  if (filter === '31-38') return age >= 31 && age <= 38
  return age >= 39
}

function matchesDatingGenderFilter(gender: DatingGenderOption, filter: DatingGenderFilter) {
  if (filter === 'all') return true
  return gender === filter
}

function buildCompatibility(
  viewer: ViewerAccount,
  myLikes: Track[],
  candidate: SocialUser,
): CompatibilityBreakdown {
  const myTrackIds = new Set(myLikes.map((track) => track.id))
  const sharedTracks = candidate.likedMusic.filter((track) => myTrackIds.has(track.id))

  const myArtists = uniqueLowercase(myLikes.map((track) => track.artist))
  const candidateArtists = uniqueLowercase(candidate.likedMusic.map((track) => track.artist))
  const sharedArtists = [...myArtists].filter((artist) => candidateArtists.has(artist))
  const myMoods = inferMoodsFromTracks(myLikes)
  const candidateMoods = inferMoodsFromTracks(candidate.likedMusic)
  const sharedMoods = [...myMoods].filter((mood) => candidateMoods.has(mood))

  // Dating-style compatibility with stronger emphasis on music overlap.
  const musicTrackScore = myLikes.length ? sharedTracks.length / myLikes.length : 0.35
  const musicArtistScore = myArtists.size ? sharedArtists.length / myArtists.size : 0.35
  const moodScore = myMoods.size ? sharedMoods.length / myMoods.size : 0.35
  const musicScore = Math.min(1, musicTrackScore * 0.6 + musicArtistScore * 0.25 + moodScore * 0.15)

  const ageDelta =
    typeof candidate.age === 'number' && typeof viewer.age === 'number'
      ? Math.abs(candidate.age - viewer.age)
      : null
  const ageScore = ageDelta === null ? 0.6 : Math.max(0, 1 - ageDelta / 14)
  const profileScore = candidate.bio.trim().length > 0 ? 1 : 0.5
  const matchOpenScore = candidate.matchOpen ? 1 : 0.25

  const weightedScore =
    musicScore * 0.78 + ageScore * 0.12 + profileScore * 0.06 + matchOpenScore * 0.04

  return {
    score: Math.round(weightedScore * 100),
    sharedTracks,
    sharedArtists,
    sharedMoods,
    ageDelta,
    matchOpenBoost: Math.round(matchOpenScore * 100),
  }
}

function App() {
  const [step, setStep] = useState<'account' | 'survey' | 'feed'>('account')
  const [viewer, setViewer] = useState<ViewerAccount | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [hydrating, setHydrating] = useState(true)

  useEffect(() => {
    async function restoreSession() {
      const storedToken = window.localStorage.getItem(SESSION_STORAGE_KEY)
      if (!storedToken) {
        setHydrating(false)
        return
      }
      try {
        const res = await fetch(`${API_BASE}/api/account/session`, {
          headers: authHeaders(storedToken),
        })
        const data = (await res.json()) as { user?: ViewerAccount }
        if (!res.ok || !data.user) {
          throw new Error('session not found')
        }
        setSessionToken(storedToken)
        setViewer(data.user)
        const hasSurvey = window.localStorage.getItem(getSurveyStorageKey(data.user.id)) === '1'
        setStep(hasSurvey ? 'feed' : 'survey')
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY)
        setStep('account')
      } finally {
        setHydrating(false)
      }
    }

    restoreSession()
  }, [])

  if (hydrating) {
    return (
      <div className="app-root">
        <div className="screen feed-screen">
          <div className="loading-state">Loading your account...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-root">
      {step === 'account' ? (
        <AccountScreen
          onAuthSuccess={(user, token) => {
            window.localStorage.setItem(SESSION_STORAGE_KEY, token)
            setSessionToken(token)
            setViewer(user)
            const hasSurvey = window.localStorage.getItem(getSurveyStorageKey(user.id)) === '1'
            setStep(hasSurvey ? 'feed' : 'survey')
          }}
        />
      ) : step === 'survey' && viewer && sessionToken ? (
        <SurveyScreen
          sessionToken={sessionToken}
          onDone={() => {
            window.localStorage.setItem(getSurveyStorageKey(viewer.id), '1')
            setStep('feed')
          }}
          onSessionExpired={() => {
            window.localStorage.removeItem(SESSION_STORAGE_KEY)
            setSessionToken(null)
            setViewer(null)
            setStep('account')
          }}
        />
      ) : (
        viewer && sessionToken && (
          <FeedScreen
            viewer={viewer}
            sessionToken={sessionToken}
            onViewerUpdate={setViewer}
            onSignOut={() => {
              fetch(`${API_BASE}/api/account/logout`, {
                method: 'POST',
                headers: authHeaders(sessionToken),
              }).catch(() => {})
              window.localStorage.removeItem(SESSION_STORAGE_KEY)
              setSessionToken(null)
              setViewer(null)
              setStep('account')
            }}
          />
        )
      )}
    </div>
  )
}

type AccountScreenProps = {
  onAuthSuccess: (user: ViewerAccount, sessionToken: string) => void
}

function AccountScreen({ onAuthSuccess }: AccountScreenProps) {
  const [mode, setMode] = useState<'create' | 'signin'>('create')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState<DatingGenderOption>('would rather not say')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profilePhotoData, setProfilePhotoData] = useState<string | null>(null)
  const [matchOpen, setMatchOpen] = useState(true)
  const [signinHandle, setSigninHandle] = useState('')
  const [signinPassword, setSigninPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleProfilePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Profile photo must be an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photo must be 5MB or smaller.')
      return
    }
    try {
      const dataUrl = await fileToDataUrl(file)
      setProfilePhotoData(dataUrl)
      setError(null)
    } catch {
      setError('Could not read that photo. Try a different image.')
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.trim() || !handle.trim() || !birthday || !gender || !password) {
      setError('Name, email, handle, birthday, gender, and password are required.')
      return
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (!profilePhotoData) {
      setError('A profile photo is required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setCreating(true)
    try {
      const res = await fetch(`${API_BASE}/api/account/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          handle: handle.trim(),
          bio: bio.trim(),
          birthday,
          gender,
          matchOpen,
          password,
          profileImageData: profilePhotoData,
        }),
      })
      const data = await parseResponseJsonSafe<{
        error?: string
        user?: ViewerAccount
        sessionToken?: string
      }>(res)
      if (!res.ok || !data?.user || !data?.sessionToken) {
        throw new Error(await readApiErrorMessage(res, 'Could not create account'))
      }
      onAuthSuccess(data.user, data.sessionToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create account'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!signinHandle.trim() || !signinPassword) {
      setError('Enter your handle and password to sign in.')
      return
    }
    setSigningIn(true)
    try {
      const res = await fetch(`${API_BASE}/api/account/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: signinHandle.trim(), password: signinPassword }),
      })
      const data = await parseResponseJsonSafe<{
        error?: string
        user?: ViewerAccount
        sessionToken?: string
      }>(res)
      if (!res.ok || !data?.user || !data?.sessionToken) {
        throw new Error(await readApiErrorMessage(res, 'Could not sign in'))
      }
      onAuthSuccess(data.user, data.sessionToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not sign in'
      setError(message)
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="screen survey-screen">
      <header className="top-bar">
        <BrandLockup />
        <span className="pill">{mode === 'create' ? 'Create account' : 'Sign in'}</span>
      </header>
      <main className="content">
        <div className="tab-row account-mode-tabs">
          <button
            className={`tab-btn ${mode === 'create' ? 'tab-btn-active' : ''}`}
            type="button"
            onClick={() => {
              setMode('create')
              setError(null)
            }}
          >
            Create
          </button>
          <button
            className={`tab-btn ${mode === 'signin' ? 'tab-btn-active' : ''}`}
            type="button"
            onClick={() => {
              setMode('signin')
              setError(null)
            }}
          >
            Sign In
          </button>
        </div>

        {mode === 'create' ? (
          <>
            <h1 className="title">Create your account</h1>
            <p className="subtitle">
              Email, birthday, gender, and profile photo are required. You can change your photo any
              time.
            </p>
            <form className="account-form" onSubmit={handleCreateAccount}>
              <label className="field-label">
                Name
                <input
                  className="search-input field-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field-label">
                Email
                <input
                  className="search-input field-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                />
              </label>
              <label className="field-label">
                Handle
                <input
                  className="search-input field-input"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="your_handle"
                />
              </label>
              <label className="field-label">
                Bio (optional)
                <input
                  className="search-input field-input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </label>
              <label className="field-label">
                Birthday
                <input
                  className="search-input field-input"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  type="date"
                />
              </label>
              <label className="field-label">
                Gender
                <select
                  className="search-input field-input"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as DatingGenderOption)}
                >
                  {DATING_GENDER_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 'would rather not say'
                        ? 'Would rather not say'
                        : option.charAt(0).toUpperCase() + option.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Password
                <input
                  className="search-input field-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="At least 8 characters"
                />
              </label>
              <label className="field-label">
                Confirm password
                <input
                  className="search-input field-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                />
              </label>
              <label className="field-label">
                Profile photo
                <input
                  className="search-input field-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleProfilePhotoFileChange}
                />
              </label>
              {profilePhotoData && (
                <img src={profilePhotoData} alt="Profile preview" className="profile-preview" />
              )}
              <label className="toggle-row">
                <span>Match mode</span>
                <button
                  className={matchOpen ? 'like-btn' : 'pass-btn'}
                  type="button"
                  onClick={() => setMatchOpen((prev) => !prev)}
                >
                  {matchOpen ? 'Open (can match)' : 'Closed (just listen)'}
                </button>
              </label>
              {error && <p className="error-text">{error}</p>}
              <button className="primary-btn primary-btn-wide" type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Continue'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="title">Sign in</h1>
            <p className="subtitle">Use your handle from account creation.</p>
            <form className="account-form" onSubmit={handleSignIn}>
              <label className="field-label">
                Handle
                <input
                  className="search-input field-input"
                  value={signinHandle}
                  onChange={(e) => setSigninHandle(e.target.value)}
                  placeholder="your_handle"
                />
              </label>
              <label className="field-label">
                Password
                <input
                  className="search-input field-input"
                  value={signinPassword}
                  onChange={(e) => setSigninPassword(e.target.value)}
                  type="password"
                />
              </label>
              {error && <p className="error-text">{error}</p>}
              <button className="primary-btn primary-btn-wide" type="submit" disabled={signingIn}>
                {signingIn ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}

type SurveyProps = {
  sessionToken: string
  onDone: () => void
  onSessionExpired: () => void
}

function SurveyScreen({ sessionToken, onDone, onSessionExpired }: SurveyProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SurveySeed[]>([])
  const [moods, setMoods] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query.trim())}`)
      if (!res.ok) throw new Error('Search failed')
      const data = (await res.json()) as { tracks: Track[] }
      setSearchResults(data.tracks)
    } catch {
      setError('Could not search tracks. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function toggleSeed(track: Track) {
    setSelected((prev) => {
      const exists = prev.find((s) => s.id === track.id)
      if (exists) {
        return prev.filter((s) => s.id !== track.id)
      }
      return [...prev, { id: track.id, title: track.title, artist: track.artist, genre: track.genre }]
    })
  }

  function toggleMood(mood: string) {
    setMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood],
    )
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({ seeds: selected, moods }),
      })
      if (!res.ok) {
        if (res.status === 401) {
          onSessionExpired()
          throw new Error('Your session expired. Sign in again to save preferences.')
        }
        throw new Error(await readApiErrorMessage(res, 'Could not save your preferences. Try again.'))
      }
      onDone()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your preferences. Try again.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const moodOptions = ['chill', 'hype', 'sad', 'focus', 'party', 'romantic']

  return (
    <div className="screen survey-screen">
      <header className="top-bar">
        <BrandLockup />
        <span className="pill">Step 1 · Your vibe</span>
      </header>

      <main className="content">
        <h1 className="title">Tell us what you like</h1>
        <p className="subtitle">
          Pick songs, pick moods, or skip both to build your feed from previous likes.
        </p>

        <form className="search-form" onSubmit={handleSearch}>
          <input
            className="search-input"
            placeholder="Search by song or artist"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}

        {selected.length > 0 && (
          <div className="chips-row">
            {selected.map((s) => (
              <button
                key={s.id}
                className="chip chip-selected"
                type="button"
                onClick={() =>
                  toggleSeed({ id: s.id, title: s.title, artist: s.artist, previewUrl: '' })
                }
              >
                {s.title} · {s.artist}
              </button>
            ))}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((t) => {
              const isSelected = selected.some((s) => s.id === t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`result-row ${isSelected ? 'result-row-selected' : ''}`}
                  onClick={() => toggleSeed(t)}
                >
                  {t.artworkUrl && <img src={t.artworkUrl} alt="" className="result-artwork" />}
                  <div className="result-meta">
                    <span className="song-title">{t.title}</span>
                    <span className="song-artist">
                      {t.artist}
                      {t.album ? ` • ${t.album}` : ''}
                    </span>
                  </div>
                  <span className="result-badge">{isSelected ? 'Added' : 'Add'}</span>
                </button>
              )
            })}
          </div>
        )}

        <section className="moods">
          <h2 className="section-title">Pick a mood (optional)</h2>
          <div className="chips-row">
            {moodOptions.map((mood) => (
              <button
                key={mood}
                type="button"
                className={`chip ${moods.includes(mood) ? 'chip-selected' : ''}`}
                onClick={() => toggleMood(mood)}
              >
                {mood}
              </button>
            ))}
          </div>
        </section>
      </main>

      <footer className="bottom-bar">
        <button
          className="primary-btn primary-btn-wide"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? 'Tuning your feed...' : 'Start swiping'}
        </button>
      </footer>
    </div>
  )
}

type FeedScreenProps = {
  viewer: ViewerAccount
  sessionToken: string
  onViewerUpdate: (next: ViewerAccount) => void
  onSignOut: () => void
}

function FeedScreen({ viewer, sessionToken, onViewerUpdate, onSignOut }: FeedScreenProps) {
  const [items, setItems] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<
    'discover' | 'liked' | 'dating' | 'photos' | 'community' | 'messages' | 'profiles'
  >('discover')
  const [activeIndex, setActiveIndex] = useState(0)
  const [likedSongs, setLikedSongs] = useState<Track[]>(() => viewer.likedMusic || [])
  const [dislikedCount, setDislikedCount] = useState(0)
  const [scrollHistory, setScrollHistory] = useState<string[]>([])
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragStartY, setDragStartY] = useState<number | null>(null)
  const [dragX, setDragX] = useState(0)
  const [datingDragStartX, setDatingDragStartX] = useState<number | null>(null)
  const [datingDragX, setDatingDragX] = useState(0)
  const [datingLikedUserIds, setDatingLikedUserIds] = useState<string[]>([])
  const [datingPassedUserIds, setDatingPassedUserIds] = useState<string[]>([])
  const [datingMatchedUserIds, setDatingMatchedUserIds] = useState<string[]>([])
  const [datingAgeFilter, setDatingAgeFilter] = useState<DatingAgeFilter>('all')
  const [datingGenderFilter, setDatingGenderFilter] = useState<DatingGenderFilter>('all')
  const [datingMoodFilters, setDatingMoodFilters] = useState<string[]>([])
  const [photoPosts, setPhotoPosts] = useState<PhotoPost[]>([])
  const [photoThreadError, setPhotoThreadError] = useState<string | null>(null)
  const [photoDraftData, setPhotoDraftData] = useState<string | null>(null)
  const [photoDraftCaption, setPhotoDraftCaption] = useState('')
  const [photoFilterPreset, setPhotoFilterPreset] = useState<PhotoFilterPreset>('none')
  const [photoOverlayPreset, setPhotoOverlayPreset] = useState<PhotoOverlayPreset>('none')
  const [photoOverlayOpacity, setPhotoOverlayOpacity] = useState(45)
  const [photoBrightness, setPhotoBrightness] = useState(100)
  const [photoContrast, setPhotoContrast] = useState(100)
  const [photoSaturation, setPhotoSaturation] = useState(100)
  const [photoBlur, setPhotoBlur] = useState(0)
  const [photoZoom, setPhotoZoom] = useState(100)
  const [photoRotation, setPhotoRotation] = useState(0)
  const [photoTextOverlay, setPhotoTextOverlay] = useState('')
  const [photoTextColor, setPhotoTextColor] = useState('#ffffff')
  const [photoTextSize, setPhotoTextSize] = useState(30)
  const [photoTextX, setPhotoTextX] = useState(50)
  const [photoTextY, setPhotoTextY] = useState(68)
  const [photoMarkupColor, setPhotoMarkupColor] = useState('#ffffff')
  const [photoMarkupSize, setPhotoMarkupSize] = useState(7)
  const [photoMarkupStrokes, setPhotoMarkupStrokes] = useState<PhotoMarkupStroke[]>([])
  const [drawingPhotoStroke, setDrawingPhotoStroke] = useState<PhotoMarkupStroke | null>(null)
  const [photoOpenTool, setPhotoOpenTool] = useState<
    'none' | 'filters' | 'edit' | 'words' | 'markup' | 'clip'
  >('none')
  const [photoClipQuery, setPhotoClipQuery] = useState('')
  const [photoClipResults, setPhotoClipResults] = useState<Track[]>([])
  const [photoClipLoading, setPhotoClipLoading] = useState(false)
  const [photoClipError, setPhotoClipError] = useState<string | null>(null)
  const [selectedPhotoClip, setSelectedPhotoClip] = useState<Track | null>(null)
  const [photoClipStartTime, setPhotoClipStartTime] = useState(0)
  const [photoClipDuration, setPhotoClipDuration] = useState(15)
  const [postingPhoto, setPostingPhoto] = useState(false)
  const [photoActiveIndex, setPhotoActiveIndex] = useState(0)
  const [photoPostsMuted, setPhotoPostsMuted] = useState(true)
  const [photoDragStartX, setPhotoDragStartX] = useState<number | null>(null)
  const [photoDragX, setPhotoDragX] = useState(0)
  const [updatingProfilePhoto, setUpdatingProfilePhoto] = useState(false)
  const [socialUsers, setSocialUsers] = useState<SocialUser[]>([])
  const [profileUserId, setProfileUserId] = useState(viewer.id)
  const [profileDetails, setProfileDetails] = useState<SocialProfileDetails | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadMessageAlerts, setUnreadMessageAlerts] = useState(0)
  const [newMatchAlerts, setNewMatchAlerts] = useState(0)
  const [socialError, setSocialError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [duration, setDuration] = useState(30)
  const [lyricsByTrack, setLyricsByTrack] = useState<Record<string, TimedLyricLine[]>>({})
  const [globalClipQuery, setGlobalClipQuery] = useState('')
  const [globalClipResults, setGlobalClipResults] = useState<Track[]>([])
  const [globalClipLoading, setGlobalClipLoading] = useState(false)
  const [globalClipError, setGlobalClipError] = useState<string | null>(null)
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const photoThreadInputRef = useRef<HTMLInputElement | null>(null)
  const photoEditorRef = useRef<HTMLDivElement | null>(null)
  const photoPostCardRef = useRef<HTMLElement | null>(null)
  const photoClipTimeoutRef = useRef<number | null>(null)
  const notificationsHydratedRef = useRef(false)
  const matchedByUserRef = useRef<Record<string, boolean>>({})
  const latestIncomingByUserRef = useRef<Record<string, number>>({})

  const currentTrack = items.length ? items[activeIndex % items.length] : null
  const selectedUser = socialUsers.find((u) => u.id === selectedUserId) || null
  const profileDirectory = useMemo<ProfileSummary[]>(
    () => [
      {
        id: viewer.id,
        name: viewer.name,
        handle: viewer.handle,
        profileImageUrl: viewer.profileImageUrl,
      },
      ...socialUsers.map((user) => ({
        id: user.id,
        name: user.name,
        handle: user.handle,
        profileImageUrl: user.profileImageUrl,
      })),
    ],
    [socialUsers, viewer.handle, viewer.id, viewer.name, viewer.profileImageUrl],
  )
  const isGigiProfile = viewer.handle.trim().toLowerCase() === 'gigi_1777'
  const allUsersForGigi = useMemo(
    () => [
      {
        id: viewer.id,
        name: viewer.name,
        handle: viewer.handle,
        bio: viewer.bio,
        age: viewer.age,
        gender: viewer.gender,
        matchOpen: viewer.matchOpen,
        profileImageUrl: viewer.profileImageUrl,
        likedSongsCount: viewer.likedMusic.length,
        isFollowing: null as boolean | null,
        followsYou: null as boolean | null,
        isMatched: null as boolean | null,
      },
      ...socialUsers.map((user) => ({
        id: user.id,
        name: user.name,
        handle: user.handle,
        bio: user.bio,
        age: user.age,
        gender: user.gender,
        matchOpen: user.matchOpen,
        profileImageUrl: user.profileImageUrl,
        likedSongsCount: user.likedMusic.length,
        isFollowing: user.isFollowing,
        followsYou: user.followsYou,
        isMatched: user.isMatched,
      })),
    ],
    [socialUsers, viewer],
  )
  const activeProfileUser = profileDirectory.find((user) => user.id === profileUserId) || profileDirectory[0] || null
  const canMessageSelectedUser = Boolean(viewer.matchOpen && selectedUser?.isMatched)
  const songShareHint = !selectedUser
    ? 'Pick someone in Community to choose who gets your shared songs.'
    : canMessageSelectedUser
      ? `Sharing sends to ${selectedUser.name}.`
      : viewer.matchOpen
        ? `Match with ${selectedUser.name} to share songs.`
        : 'Open your match mode to share songs.'
  const swipeLabel = dragX > 80 ? 'LIKE' : dragX < -80 ? 'PASS' : null
  const datingSwipeLabel = datingDragX > 80 ? 'LIKE' : datingDragX < -80 ? 'PASS' : null
  const photoSwipeLabel = photoDragX > 80 ? 'NEXT' : photoDragX < -80 ? 'NEXT' : null
  const datingCandidates = useMemo(() => {
    return socialUsers
      .filter((user) => user.id !== viewer.id)
      .map((candidate) => ({
        candidate,
        candidateMoods: inferMoodsFromTracks(candidate.likedMusic),
        compatibility: buildCompatibility(viewer, likedSongs, candidate),
      }))
      .sort((a, b) => b.compatibility.score - a.compatibility.score)
  }, [likedSongs, socialUsers, viewer])
  const messagingConnections = useMemo(
    () =>
      socialUsers
        .filter((user) => user.isMutualFollow || user.isMatched)
        .sort((a, b) => {
          if (a.isMatched !== b.isMatched) return a.isMatched ? -1 : 1
          return a.name.localeCompare(b.name)
        }),
    [socialUsers],
  )
  const likedYouUsers = useMemo(
    () =>
      socialUsers
        .filter((user) => user.followsYou)
        .sort((a, b) => {
          if (a.isMatched !== b.isMatched) return a.isMatched ? -1 : 1
          if (a.isFollowing !== b.isFollowing) return a.isFollowing ? -1 : 1
          return a.name.localeCompare(b.name)
        }),
    [socialUsers],
  )
  const remainingDatingCandidates = useMemo(
    () =>
      datingCandidates.filter(
        ({ candidate, candidateMoods }) =>
          !datingLikedUserIds.includes(candidate.id) &&
          !datingPassedUserIds.includes(candidate.id) &&
          matchesDatingAgeFilter(candidate.age, datingAgeFilter) &&
          matchesDatingGenderFilter(candidate.gender, datingGenderFilter) &&
          (datingMoodFilters.length === 0 ||
            datingMoodFilters.some((mood) => candidateMoods.has(mood))),
      ),
    [
      datingAgeFilter,
      datingCandidates,
      datingGenderFilter,
      datingLikedUserIds,
      datingMoodFilters,
      datingPassedUserIds,
    ],
  )
  const activeDatingCandidate = remainingDatingCandidates[0] || null
  const activePhotoPost = photoPosts.length ? photoPosts[photoActiveIndex % photoPosts.length] : null
  const activePhotoCaption = activePhotoPost
    ? activePhotoPost.caption
        .split('\n')
        .filter((line) => !line.trim().startsWith('🎵 Clip:'))
        .join('\n')
        .trim()
    : ''
  const activeFilterStyle = PHOTO_FILTER_PRESETS.find((preset) => preset.id === photoFilterPreset)?.filter || 'none'
  const activeOverlayStops = PHOTO_OVERLAY_PRESETS.find((preset) => preset.id === photoOverlayPreset)?.stops || [
    'transparent',
    'transparent',
    'transparent',
  ]
  const activePhotoTransform = `translate(-50%, -50%) scale(${photoZoom / 100}) rotate(${photoRotation}deg)`
  const activePhotoFilter = `${activeFilterStyle} brightness(${photoBrightness}%) contrast(${photoContrast}%) saturate(${photoSaturation}%) blur(${photoBlur}px)`.trim()

  function toggleDatingMoodFilter(mood: string) {
    setDatingMoodFilters((prev) =>
      prev.includes(mood) ? prev.filter((candidateMood) => candidateMood !== mood) : [...prev, mood],
    )
  }

  const sendBrowserNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    const create = () =>
      new Notification(title, {
        body,
      })
    if (Notification.permission === 'granted') {
      create()
      return
    }
    if (Notification.permission === 'default') {
      Notification.requestPermission()
        .then((permission) => {
          if (permission === 'granted') create()
        })
        .catch(() => {})
    }
  }, [])

  async function handleProfilePhotoUpdate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setSocialError('Profile photo must be an image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setSocialError('Profile photo must be 5MB or smaller.')
      return
    }
    try {
      setUpdatingProfilePhoto(true)
      const profileImageData = await fileToDataUrl(file)
      const res = await fetch(`${API_BASE}/api/account/profile-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({ profileImageData }),
      })
      const data = await parseResponseJsonSafe<{ error?: string; user?: ViewerAccount }>(res)
      if (!res.ok || !data?.user) {
        throw new Error(await readApiErrorMessage(res, 'Could not update profile photo'))
      }
      onViewerUpdate(data.user)
      setSocialError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update profile photo'
      setSocialError(message)
    } finally {
      setUpdatingProfilePhoto(false)
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = ''
    }
  }

  async function handlePhotoDraftFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPhotoThreadError('Photo post must be an image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoThreadError('Photo post must be 5MB or smaller.')
      return
    }
    try {
      const imageData = await fileToDataUrl(file)
      resetPhotoDraftComposer(false)
      setPhotoDraftData(imageData)
    } catch {
      setPhotoThreadError('Could not read that photo. Try a different file.')
    }
  }

  function getRelativePhotoPoint(event: React.PointerEvent<HTMLDivElement>) {
    const editor = photoEditorRef.current
    if (!editor) return null
    const rect = editor.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    }
  }

  function handlePhotoMarkupPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!photoDraftData) return
    const point = getRelativePhotoPoint(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrawingPhotoStroke({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      color: photoMarkupColor,
      size: photoMarkupSize,
      points: [point],
    })
  }

  function handlePhotoMarkupPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drawingPhotoStroke) return
    const point = getRelativePhotoPoint(event)
    if (!point) return
    setDrawingPhotoStroke((prev) =>
      prev
        ? {
            ...prev,
            points: [...prev.points, point],
          }
        : prev,
    )
  }

  function finishPhotoMarkupStroke() {
    setDrawingPhotoStroke((prev) => {
      if (!prev || prev.points.length < 2) return null
      setPhotoMarkupStrokes((existing) => [...existing, prev])
      return null
    })
  }

  function clearPhotoClipTimeout() {
    if (photoClipTimeoutRef.current !== null) {
      window.clearTimeout(photoClipTimeoutRef.current)
      photoClipTimeoutRef.current = null
    }
  }

  function resetPhotoDraftComposer(clearDraftImage = true) {
    clearPhotoClipTimeout()
    if (activeId?.startsWith('photo-clip-') && audioRef.current) {
      audioRef.current.pause()
      setActiveId(null)
    }
    if (clearDraftImage) setPhotoDraftData(null)
    setPhotoDraftCaption('')
    setPhotoFilterPreset('none')
    setPhotoOverlayPreset('none')
    setPhotoOverlayOpacity(45)
    setPhotoBrightness(100)
    setPhotoContrast(100)
    setPhotoSaturation(100)
    setPhotoBlur(0)
    setPhotoZoom(100)
    setPhotoRotation(0)
    setPhotoTextOverlay('')
    setPhotoTextColor('#ffffff')
    setPhotoTextSize(30)
    setPhotoTextX(50)
    setPhotoTextY(68)
    setPhotoMarkupStrokes([])
    setDrawingPhotoStroke(null)
    setPhotoOpenTool('none')
    setSelectedPhotoClip(null)
    setPhotoClipQuery('')
    setPhotoClipResults([])
    setPhotoClipError(null)
    setPhotoClipStartTime(0)
    setPhotoClipDuration(15)
    setPhotoThreadError(null)
    if (photoThreadInputRef.current) photoThreadInputRef.current.value = ''
  }

  function handlePlayPhotoClip() {
    if (!selectedPhotoClip?.previewUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const clipId = `photo-clip-${selectedPhotoClip.id}`
    const player = audioRef.current
    if (activeId === clipId && !player.paused) {
      player.pause()
      setActiveId(null)
      clearPhotoClipTimeout()
      return
    }
    if (player.src !== selectedPhotoClip.previewUrl) {
      player.src = selectedPhotoClip.previewUrl
    }
    const safeStart = clamp(photoClipStartTime, 0, PHOTO_CLIP_PREVIEW_SECONDS - 1)
    const safeDuration = clamp(photoClipDuration, 5, PHOTO_CLIP_PREVIEW_SECONDS - safeStart)
    player.currentTime = safeStart
    player.play().catch(() => {})
    setActiveId(clipId)
    clearPhotoClipTimeout()
    photoClipTimeoutRef.current = window.setTimeout(() => {
      player.pause()
      setActiveId((prev) => (prev === clipId ? null : prev))
      photoClipTimeoutRef.current = null
    }, safeDuration * 1000)
  }

  function playPhotoPostClip(post: PhotoPost) {
    const clip = post.clip
    if (!clip?.previewUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const clipId = `photo-post-clip-${post.id}`
    const player = audioRef.current
    if (activeId === clipId && !player.paused) return
    if (player.src !== clip.previewUrl) {
      player.src = clip.previewUrl
    }
    const safeStart = clamp(clip.startTime, 0, PHOTO_CLIP_PREVIEW_SECONDS - 1)
    const safeDuration = clamp(clip.duration, 5, PHOTO_CLIP_PREVIEW_SECONDS - safeStart)
    player.muted = photoPostsMuted
    player.currentTime = safeStart
    player.play().catch(() => {})
    setActiveId(clipId)
    clearPhotoClipTimeout()
    photoClipTimeoutRef.current = window.setTimeout(() => {
      player.pause()
      setActiveId((prev) => (prev === clipId ? null : prev))
      photoClipTimeoutRef.current = null
    }, safeDuration * 1000)
  }

  async function composePhotoPostImage() {
    if (!photoDraftData) throw new Error('Choose a photo to post.')
    const image = await loadImageFromDataUrl(photoDraftData)
    const maxSide = 1280
    const initialWidth = image.naturalWidth || image.width
    const initialHeight = image.naturalHeight || image.height
    const scale = Math.min(1, maxSide / Math.max(initialWidth, initialHeight))
    const width = Math.max(1, Math.round(initialWidth * scale))
    const height = Math.max(1, Math.round(initialHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create image editor')

    ctx.save()
    ctx.filter = activePhotoFilter || 'none'
    ctx.translate(width / 2, height / 2)
    ctx.rotate((photoRotation * Math.PI) / 180)
    ctx.scale(photoZoom / 100, photoZoom / 100)
    ctx.drawImage(image, -width / 2, -height / 2, width, height)
    ctx.restore()

    if (photoOverlayPreset !== 'none' && photoOverlayOpacity > 0) {
      const gradient = ctx.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, activeOverlayStops[0])
      gradient.addColorStop(0.45, activeOverlayStops[1])
      gradient.addColorStop(1, activeOverlayStops[2])
      ctx.save()
      ctx.globalAlpha = clamp(photoOverlayOpacity, 0, 100) / 100
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
      ctx.restore()
    }

    for (const stroke of photoMarkupStrokes) {
      if (stroke.points.length < 2) continue
      ctx.beginPath()
      stroke.points.forEach((point, index) => {
        const x = point.x * width
        const y = point.y * height
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = stroke.color
      ctx.lineWidth = Math.max(1.6, stroke.size * (Math.min(width, height) / 360))
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.stroke()
    }

    if (photoTextOverlay.trim()) {
      const textX = (clamp(photoTextX, 0, 100) / 100) * width
      const textY = (clamp(photoTextY, 0, 100) / 100) * height
      const textSizePx = Math.max(12, photoTextSize * (Math.min(width, height) / 360))
      ctx.save()
      ctx.font = `700 ${textSizePx}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = photoTextColor
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 2
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
      ctx.lineWidth = Math.max(1, textSizePx * 0.06)
      ctx.strokeText(photoTextOverlay.trim(), textX, textY)
      ctx.fillText(photoTextOverlay.trim(), textX, textY)
      ctx.restore()
    }

    return canvas.toDataURL('image/jpeg', 0.92)
  }

  async function handleCreatePhotoPost() {
    if (!photoDraftData) {
      setPhotoThreadError('Choose a photo to post.')
      return
    }
    try {
      setPostingPhoto(true)
      setPhotoThreadError(null)
      const composedImageData = await composePhotoPostImage()
      const baseCaption = photoDraftCaption.trim()
      const normalizedPhotoClip = selectedPhotoClip
        ? {
            id: selectedPhotoClip.id,
            title: selectedPhotoClip.title,
            artist: selectedPhotoClip.artist,
            album: selectedPhotoClip.album,
            previewUrl: selectedPhotoClip.previewUrl,
            startTime: clamp(photoClipStartTime, 0, PHOTO_CLIP_PREVIEW_SECONDS - 1),
            duration: clamp(photoClipDuration, 5, PHOTO_CLIP_PREVIEW_SECONDS - photoClipStartTime),
          }
        : null
      const res = await fetch(`${API_BASE}/api/social/photo-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({
          imageData: composedImageData,
          caption: baseCaption,
          clip: normalizedPhotoClip,
        }),
      })
      const data = await parseResponseJsonSafe<{ error?: string; post?: PhotoPost }>(res)
      if (!res.ok || !data?.post) {
        throw new Error(await readApiErrorMessage(res, 'Could not create photo post'))
      }
      setPhotoPosts((prev) => [data.post as PhotoPost, ...prev])
      setPhotoActiveIndex(0)
      resetPhotoDraftComposer(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create photo post'
      setPhotoThreadError(message)
    } finally {
      setPostingPhoto(false)
    }
  }

  function stepPhotoThread(direction: 'next' | 'back') {
    if (!photoPosts.length) return
    setPhotoDragX(0)
    setPhotoActiveIndex((prev) => {
      if (direction === 'next') return (prev + 1) % photoPosts.length
      return (prev - 1 + photoPosts.length) % photoPosts.length
    })
  }

  useEffect(() => {
    async function loadFeed() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/api/feed`, {
          headers: authHeaders(sessionToken),
        })
        if (res.status === 401) {
          onSignOut()
          throw new Error('Your session expired. Sign in again.')
        }
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res, 'Could not load your feed.'))
        }
        const data = (await res.json()) as { items: Track[] }
        setItems(data.items)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load your feed.'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    async function loadSocialUsers() {
      setSocialError(null)
      try {
        const res = await fetch(`${API_BASE}/api/social/users`, {
          headers: authHeaders(sessionToken),
        })
        if (!res.ok) throw new Error('Social load failed')
        const data = (await res.json()) as { users: SocialUser[] }
        setSocialUsers(data.users)
        const preferredUserId =
          data.users.find((user) => user.isMatched || user.isMutualFollow)?.id ||
          data.users[0]?.id ||
          null
        setSelectedUserId((prev) => {
          if (!data.users.length) return null
          if (prev && data.users.some((user) => user.id === prev)) return prev
          return preferredUserId
        })
      } catch {
        setSocialError('Could not load community right now.')
      }
    }

    async function loadPhotoPosts() {
      setPhotoThreadError(null)
      try {
        const res = await fetch(`${API_BASE}/api/social/photo-posts`, {
          headers: authHeaders(sessionToken),
        })
        if (!res.ok) throw new Error(await readApiErrorMessage(res, 'Photo feed load failed'))
        const data = await parseResponseJsonSafe<{ posts?: PhotoPost[] }>(res)
        setPhotoPosts(Array.isArray(data?.posts) ? data.posts : [])
        setPhotoActiveIndex(0)
      } catch {
        setPhotoThreadError('Could not load photo thread right now.')
      }
    }

    loadFeed()
    loadSocialUsers()
    loadPhotoPosts()
  }, [sessionToken])

  useEffect(() => {
    if (!selectedUserId) return

    async function loadMessages() {
      try {
        const res = await fetch(
          `${API_BASE}/api/social/messages?withUserId=${selectedUserId}`,
          {
            headers: authHeaders(sessionToken),
          },
        )
        if (!res.ok) throw new Error('Chat load failed')
        const data = (await res.json()) as { messages: ChatMessage[] }
        setMessages(data.messages)
      } catch {
        setMessages([])
      }
    }

    loadMessages()
  }, [selectedUserId, sessionToken])

  useEffect(() => {
    if (!profileDirectory.some((user) => user.id === profileUserId)) {
      setProfileUserId(viewer.id)
    }
  }, [profileDirectory, profileUserId, viewer.id])

  useEffect(() => {
    if (tab !== 'profiles') return
    const targetId = activeProfileUser?.id || viewer.id
    let cancelled = false

    async function loadProfileDetails() {
      setProfileLoading(true)
      setProfileError(null)
      try {
        const res = await fetch(`${API_BASE}/api/social/profiles/${encodeURIComponent(targetId)}`, {
          headers: authHeaders(sessionToken),
        })
        const data = await parseResponseJsonSafe<{
          profile?: SocialUser
          posts?: PhotoPost[]
          matches?: ProfileSummary[]
          messages?: ProfileMessage[]
        }>(res)
        if (!res.ok || !data?.profile) {
          throw new Error(await readApiErrorMessage(res, 'Could not load that profile right now.'))
        }
        if (cancelled) return
        setProfileDetails({
          profile: data.profile,
          posts: Array.isArray(data.posts) ? data.posts : [],
          matches: Array.isArray(data.matches) ? data.matches : [],
          messages: Array.isArray(data.messages) ? data.messages : [],
        })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Could not load that profile right now.'
        setProfileError(message)
        setProfileDetails(null)
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    }

    loadProfileDetails()
    return () => {
      cancelled = true
    }
  }, [activeProfileUser?.id, sessionToken, tab, viewer.id])

  useEffect(() => {
    let cancelled = false

    async function pollSocialNotifications() {
      try {
        const usersRes = await fetch(`${API_BASE}/api/social/users`, {
          headers: authHeaders(sessionToken),
        })
        if (!usersRes.ok) throw new Error('social poll failed')
        const usersData = (await usersRes.json()) as { users: SocialUser[] }
        if (cancelled) return
        setSocialUsers(usersData.users)
        const preferredUserId =
          usersData.users.find((user) => user.isMatched || user.isMutualFollow)?.id ||
          usersData.users[0]?.id ||
          null
        setSelectedUserId((prev) => {
          if (!usersData.users.length) return null
          if (prev && usersData.users.some((user) => user.id === prev)) return prev
          return preferredUserId
        })

        const conversationUsers = usersData.users.filter((user) => user.isMutualFollow || user.isMatched)
        const messageSnapshots = await Promise.all(
          conversationUsers.map(async (user) => {
            const res = await fetch(`${API_BASE}/api/social/messages?withUserId=${user.id}`, {
              headers: authHeaders(sessionToken),
            })
            if (!res.ok) return { user, latestIncomingSentAt: 0, latestIncomingText: '' }
            const data = (await res.json()) as { messages: ChatMessage[] }
            const latestIncoming = [...data.messages]
              .reverse()
              .find((message) => message.fromId === user.id && message.toId === viewer.id)
            return {
              user,
              latestIncomingSentAt: latestIncoming?.sentAt ?? 0,
              latestIncomingText: latestIncoming?.text ?? '',
            }
          }),
        )
        if (cancelled) return

        let newIncomingCount = 0
        let newMatchCount = 0
        for (const user of usersData.users) {
          const previousMatched = matchedByUserRef.current[user.id]
          if (typeof previousMatched === 'boolean') {
            if (!previousMatched && user.isMatched) {
              newMatchCount += 1
              sendBrowserNotification('New match on Tune Time', `You matched with ${user.name}.`)
            }
          } else {
            matchedByUserRef.current[user.id] = user.isMatched
          }
          matchedByUserRef.current[user.id] = user.isMatched
        }

        for (const snapshot of messageSnapshots) {
          const previousLatestIncoming = latestIncomingByUserRef.current[snapshot.user.id] ?? 0
          if (snapshot.latestIncomingSentAt > previousLatestIncoming) {
            const viewingThreadNow =
              document.visibilityState === 'visible' && tab === 'messages' && selectedUserId === snapshot.user.id
            if (notificationsHydratedRef.current && !viewingThreadNow) {
              newIncomingCount += 1
              const body = snapshot.latestIncomingText || `${snapshot.user.name} sent you a message.`
              sendBrowserNotification(`New message from ${snapshot.user.name}`, body)
            }
            latestIncomingByUserRef.current[snapshot.user.id] = snapshot.latestIncomingSentAt
          } else if (!latestIncomingByUserRef.current[snapshot.user.id]) {
            latestIncomingByUserRef.current[snapshot.user.id] = snapshot.latestIncomingSentAt
          }
        }

        if (!notificationsHydratedRef.current) {
          notificationsHydratedRef.current = true
          return
        }

        if (newIncomingCount > 0) {
          setUnreadMessageAlerts((prev) => prev + newIncomingCount)
        }
        if (newMatchCount > 0) {
          setNewMatchAlerts((prev) => prev + newMatchCount)
        }
      } catch {
        // Silence polling errors; regular UI fetches already handle user-facing errors.
      }
    }

    pollSocialNotifications()
    const intervalId = window.setInterval(pollSocialNotifications, 8000)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [selectedUserId, sendBrowserNotification, sessionToken, tab, viewer.id])

  useEffect(() => {
    if (tab === 'messages') {
      setUnreadMessageAlerts(0)
    }
    if (tab === 'community' || tab === 'dating') {
      setNewMatchAlerts(0)
    }
  }, [tab])

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const player = audioRef.current
    const onLoadedMeta = () => setDuration(player.duration || 30)
    const onEnded = () => setActiveId(null)
    player.addEventListener('loadedmetadata', onLoadedMeta)
    player.addEventListener('ended', onEnded)
    return () => {
      if (photoClipTimeoutRef.current !== null) {
        window.clearTimeout(photoClipTimeoutRef.current)
        photoClipTimeoutRef.current = null
      }
      player.pause()
      player.removeEventListener('loadedmetadata', onLoadedMeta)
      player.removeEventListener('ended', onEnded)
    }
  }, [])

  useEffect(() => {
    if (!currentTrack?.previewUrl) return
    handlePlay(currentTrack, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id])

  useEffect(() => {
    if (!currentTrack || lyricsByTrack[currentTrack.id]) return
    async function loadLyrics(track: Track) {
      try {
        const res = await fetch(
          `${API_BASE}/api/lyrics?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`,
        )
        if (!res.ok) throw new Error('Lyrics fetch failed')
        const data = (await res.json()) as { lines: string[] }
        const lines = Array.isArray(data.lines) ? data.lines : []
        const totalDuration = duration > 0 ? duration : 30
        const segment = lines.length > 0 ? totalDuration / lines.length : 0
        const timedLines = lines.map((line, idx) => ({
          text: line,
          startTime: idx * segment,
          endTime: (idx + 1) * segment,
        }))
        setLyricsByTrack((prev) => ({ ...prev, [track.id]: timedLines }))
      } catch {
        setLyricsByTrack((prev) => ({ ...prev, [track.id]: [] }))
      }
    }
    loadLyrics(currentTrack)
  }, [currentTrack, duration, lyricsByTrack])

  useEffect(() => {
    const trimmedQuery = globalClipQuery.trim()
    if (!trimmedQuery) {
      setGlobalClipResults([])
      setGlobalClipError(null)
      setGlobalClipLoading(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      async function searchSongClips() {
        setGlobalClipLoading(true)
        setGlobalClipError(null)
        try {
          const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
            signal: controller.signal,
          })
          if (!res.ok) throw new Error('Search failed')
          const data = (await res.json()) as { tracks?: Track[] }
          setGlobalClipResults(Array.isArray(data.tracks) ? data.tracks : [])
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setGlobalClipError('Could not search song clips right now.')
          setGlobalClipResults([])
        } finally {
          setGlobalClipLoading(false)
        }
      }
      searchSongClips()
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [globalClipQuery])

  useEffect(() => {
    const trimmedQuery = photoClipQuery.trim()
    if (!trimmedQuery) {
      setPhotoClipResults([])
      setPhotoClipError(null)
      setPhotoClipLoading(false)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      async function searchPhotoClip() {
        setPhotoClipLoading(true)
        setPhotoClipError(null)
        try {
          const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(trimmedQuery)}`, {
            signal: controller.signal,
          })
          if (!res.ok) throw new Error('Clip search failed')
          const data = (await res.json()) as { tracks?: Track[] }
          setPhotoClipResults(Array.isArray(data.tracks) ? data.tracks.slice(0, 6) : [])
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setPhotoClipError('Could not search clips right now.')
          setPhotoClipResults([])
        } finally {
          setPhotoClipLoading(false)
        }
      }
      searchPhotoClip()
    }, 250)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [photoClipQuery])

  useEffect(() => {
    const maxDuration = Math.max(5, PHOTO_CLIP_PREVIEW_SECONDS - photoClipStartTime)
    if (photoClipDuration > maxDuration) {
      setPhotoClipDuration(maxDuration)
    }
  }, [photoClipDuration, photoClipStartTime])

  useEffect(() => {
    if (!photoPostCardRef.current || !activePhotoPost?.clip?.previewUrl || tab !== 'photos') return
    const clipId = `photo-post-clip-${activePhotoPost.id}`
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          playPhotoPostClip(activePhotoPost)
          return
        }
        if (activeId === clipId && audioRef.current) {
          audioRef.current.pause()
          setActiveId(null)
          clearPhotoClipTimeout()
        }
      },
      {
        threshold: [0.2, 0.65, 0.95],
      },
    )
    observer.observe(photoPostCardRef.current)
    return () => {
      observer.disconnect()
      if (activeId === clipId && audioRef.current) {
        audioRef.current.pause()
        setActiveId(null)
        clearPhotoClipTimeout()
      }
    }
  }, [activeId, activePhotoPost, tab])

  useEffect(() => {
    if (!audioRef.current) return
    if (!activeId?.startsWith('photo-post-clip-')) return
    audioRef.current.muted = photoPostsMuted
  }, [activeId, photoPostsMuted])

  function handlePlay(track: Track, restart = false) {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const player = audioRef.current
    if (activeId === track.id && !player.paused) {
      player.pause()
      setActiveId(null)
      return
    }
    if (player.src !== track.previewUrl || restart) {
      player.src = track.previewUrl
      player.currentTime = 0
    }
    player.play().catch(() => {})
    setActiveId(track.id)
  }

  function handleSelectGlobalClip(track: Track) {
    const existingTrackIndex = items.findIndex((song) => song.id === track.id)
    if (existingTrackIndex >= 0) {
      setActiveIndex(existingTrackIndex)
    } else {
      setItems((prev) => [track, ...prev])
      setActiveIndex(0)
    }
    setTab('discover')
    setDragX(0)
    setGlobalClipQuery('')
    setGlobalClipResults([])
    setGlobalClipError(null)
  }

  async function swipe(action: 'like' | 'dislike' | 'skip') {
    if (!currentTrack || !items.length) return
    if (action === 'like') {
      setLikedSongs((prev) => {
        if (prev.some((song) => song.id === currentTrack.id)) return prev
        return [currentTrack, ...prev]
      })
      fetch(`${API_BASE}/api/social/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({ track: currentTrack }),
      }).catch(() => {})
    } else if (action === 'dislike') {
      setDislikedCount((prev) => prev + 1)
    } else {
      setScrollHistory((prev) => [...prev, currentTrack.id])
    }
    setDragX(0)
    setActiveIndex((prev) => (prev + 1) % items.length)
  }

  function handleScrollBack() {
    if (!scrollHistory.length) return
    setScrollHistory((prev) => {
      for (let idx = prev.length - 1; idx >= 0; idx -= 1) {
        const trackId = prev[idx]
        const foundIndex = items.findIndex((track) => track.id === trackId)
        if (foundIndex >= 0) {
          setDragX(0)
          setActiveIndex(foundIndex)
          return prev.slice(0, idx)
        }
      }
      return []
    })
  }

  async function handleFollowToggle(user: SocialUser) {
    if (!viewer.matchOpen) {
      setSocialError('Your match mode is closed. Open it to follow and match.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/social/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({
          targetId: user.id,
          action: user.isFollowing ? 'unfollow' : 'follow',
        }),
      })
      if (!res.ok) throw new Error('follow failed')
      const data = (await res.json()) as {
        isFollowing: boolean
        followsYou: boolean
        isMutualFollow: boolean
        isMatched: boolean
      }
      setSocialUsers((prev) =>
        prev.map((candidate) =>
          candidate.id === user.id
            ? {
                ...candidate,
                isFollowing: data.isFollowing,
                followsYou: data.followsYou,
                isMutualFollow: data.isMutualFollow,
                isMatched: data.isMatched,
              }
            : candidate,
        ),
      )
    } catch {
      setSocialError('Could not update follow status.')
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedUser || !chatInput.trim()) return
    if (!viewer.matchOpen || !selectedUser.isMatched) {
      setSocialError('Messaging is available only when you are matched and match mode is open.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/social/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({
          toId: selectedUser.id,
          text: chatInput.trim(),
        }),
      })
      if (!res.ok) throw new Error('send failed')
      const data = (await res.json()) as { message: ChatMessage }
      setMessages((prev) => [...prev, data.message])
      setChatInput('')
    } catch {
      setSocialError('Could not send your message.')
    }
  }

  async function handleSendSong(track: Track) {
    if (!selectedUser) return
    if (!viewer.matchOpen || !selectedUser.isMatched) {
      setSocialError('Song sharing is available only when you are matched and match mode is open.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/social/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({
          toId: selectedUser.id,
          track,
        }),
      })
      const data = await parseResponseJsonSafe<{ error?: string; message?: ChatMessage }>(res)
      const sentMessage = data?.message
      if (!res.ok || !sentMessage) {
        throw new Error(await readApiErrorMessage(res, 'Could not share that song.'))
      }
      setMessages((prev) => [...prev, sentMessage])
      setSocialError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not share that song.'
      setSocialError(message)
    }
  }

  async function handleMatchModeToggle() {
    try {
      const nextMatchOpen = !viewer.matchOpen
      const res = await fetch(`${API_BASE}/api/account/match-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({ matchOpen: nextMatchOpen }),
      })
      if (!res.ok) throw new Error('mode update failed')
      const data = (await res.json()) as { matchOpen: boolean }
      onViewerUpdate({ ...viewer, matchOpen: data.matchOpen })
    } catch {
      setSocialError('Could not update your match mode.')
    }
  }

  async function handleDatingSwipe(action: 'like' | 'dislike') {
    if (!activeDatingCandidate) return
    const user = activeDatingCandidate.candidate
    if (action === 'dislike') {
      setDatingPassedUserIds((prev) => [...prev, user.id])
      setDatingDragX(0)
      return
    }
    if (!viewer.matchOpen) {
      setSocialError('Your match mode is closed. Open it to like dating profiles.')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/social/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({
          targetId: user.id,
          action: user.isFollowing ? 'unfollow' : 'follow',
        }),
      })
      if (!res.ok) throw new Error('dating like failed')
      const data = (await res.json()) as { isFollowing: boolean; isMatched: boolean }
      setSocialUsers((prev) =>
        prev.map((candidate) =>
          candidate.id === user.id
            ? { ...candidate, isFollowing: data.isFollowing, isMatched: data.isMatched }
            : candidate,
        ),
      )
      if (data.isFollowing) {
        setDatingLikedUserIds((prev) => [...prev, user.id])
      } else {
        setDatingPassedUserIds((prev) => [...prev, user.id])
      }
      if (data.isMatched) {
        setDatingMatchedUserIds((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]))
      }
      setDatingDragX(0)
    } catch {
      setSocialError('Could not like this dating profile right now.')
    }
  }

  const likesCount = likedSongs.length
  const actionSummary = useMemo(
    () => `${likesCount} liked · ${dislikedCount} passed`,
    [dislikedCount, likesCount],
  )

  if (loading) {
    return (
      <div className="screen feed-screen">
        <div className="loading-state">Loading your mix...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="screen feed-screen">
        <p className="error-text">{error}</p>
      </div>
    )
  }

  return (
    <div className="screen feed-screen">
      <header className="top-bar feed-top-bar">
        <div className="feed-top-left">
          <BrandLockup />
          <div className="global-clip-search">
            <input
              className="search-input global-search-input"
              placeholder="Search song clips"
              value={globalClipQuery}
              onChange={(e) => setGlobalClipQuery(e.target.value)}
            />
            {globalClipQuery.trim() && (
              <div className="global-search-results">
                {globalClipLoading ? (
                  <p className="empty-text global-search-message">Searching song clips...</p>
                ) : globalClipError ? (
                  <p className="error-text global-search-message">{globalClipError}</p>
                ) : globalClipResults.length === 0 ? (
                  <p className="empty-text global-search-message">No song clips found.</p>
                ) : (
                  globalClipResults.map((song) => (
                    <button
                      key={song.id}
                      type="button"
                      className="result-row global-search-result-row"
                      onClick={() => handleSelectGlobalClip(song)}
                    >
                      {song.artworkUrl && <img src={song.artworkUrl} alt="" className="result-artwork" />}
                      <div className="result-meta">
                        <span className="song-title">{song.title}</span>
                        <span className="song-artist">
                          {song.artist}
                          {song.album ? ` • ${song.album}` : ''}
                        </span>
                      </div>
                      <span className="result-badge">
                        {activeId === song.id ? 'Pause Clip' : 'Play Clip'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div className="header-actions">
          <span className="pill">{actionSummary}</span>
          <button className="mini-btn" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <nav className="tab-row">
        <button
          className={`tab-btn ${tab === 'discover' ? 'tab-btn-active' : ''}`}
          type="button"
          onClick={() => setTab('discover')}
        >
          Discover
        </button>
        <button
          className={`tab-btn ${tab === 'liked' ? 'tab-btn-active' : ''}`}
          type="button"
          onClick={() => setTab('liked')}
        >
          Liked Music
        </button>
        <button
          className={`tab-btn ${tab === 'dating' ? 'tab-btn-active' : ''}`}
          type="button"
          onClick={() => setTab('dating')}
        >
          Dating
        </button>
        <button
          className={`tab-btn ${tab === 'photos' ? 'tab-btn-active' : ''}`}
          type="button"
          onClick={() => setTab('photos')}
        >
          Photo Thread
        </button>
        <button
          className={`tab-btn ${tab === 'community' ? 'tab-btn-active' : ''}`}
          type="button"
          onClick={() => setTab('community')}
        >
          Community{likedYouUsers.length > 0 ? ` (${likedYouUsers.length})` : newMatchAlerts > 0 ? ` (${newMatchAlerts})` : ''}
        </button>
        <button
          className={`tab-btn ${tab === 'profiles' ? 'tab-btn-active' : ''}`}
          type="button"
          onClick={() => setTab('profiles')}
        >
          Profiles
        </button>
        <button
          className={`tab-btn ${tab === 'messages' ? 'tab-btn-active' : ''}`}
          type="button"
          onClick={() => setTab('messages')}
        >
          Messages{unreadMessageAlerts > 0 ? ` (${unreadMessageAlerts})` : ''}
        </button>
      </nav>

      {tab === 'discover' && currentTrack && (
        <main className="swipe-main">
          <section className="deck">
            <article
              className="swipe-card"
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX / 18}deg)`,
              }}
              onPointerDown={(event) => {
                setDragStartX(event.clientX)
                setDragStartY(event.clientY)
              }}
              onPointerMove={(event) => {
                if (dragStartX === null || dragStartY === null) return
                const deltaX = event.clientX - dragStartX
                const deltaY = event.clientY - dragStartY
                // Prioritize horizontal movement for card tilt/label feedback.
                setDragX(Math.abs(deltaX) >= Math.abs(deltaY) ? deltaX : 0)
              }}
              onPointerUp={(event) => {
                const deltaY = dragStartY === null ? 0 : dragStartY - event.clientY
                if (deltaY > 90) {
                  swipe('skip')
                } else if (deltaY < -90) {
                  handleScrollBack()
                } else if (dragX > 90) {
                  swipe('like')
                } else if (dragX < -90) {
                  swipe('dislike')
                } else {
                  setDragX(0)
                }
                setDragStartX(null)
                setDragStartY(null)
              }}
              onPointerCancel={() => {
                setDragStartX(null)
                setDragStartY(null)
                setDragX(0)
              }}
            >
              {currentTrack.artworkUrl && (
                <img src={currentTrack.artworkUrl} alt="" className="card-artwork" />
              )}
              <div className="card-overlay-gradient" />
              {swipeLabel && (
                <div className={`swipe-chip ${swipeLabel === 'LIKE' ? 'swipe-like' : 'swipe-pass'}`}>
                  {swipeLabel}
                </div>
              )}
              <div className="cover-meta">
                <h2 className="card-title">{currentTrack.title}</h2>
                <p className="card-artist">{currentTrack.artist}</p>
                {currentTrack.album && <p className="card-album">{currentTrack.album}</p>}
              </div>
              <button className="play-btn" type="button" onClick={() => handlePlay(currentTrack)}>
                {activeId === currentTrack.id ? 'Pause' : 'Play'}
              </button>
            </article>

            <div className="swipe-controls">
              <button className="pass-btn" type="button" onClick={() => swipe('dislike')}>
                Swipe Left
              </button>
              <button className="mini-btn" type="button" onClick={() => swipe('skip')}>
                Scroll
              </button>
              <button
                className="mini-btn"
                type="button"
                onClick={handleScrollBack}
                disabled={!scrollHistory.length}
              >
                Scroll Back
              </button>
              <button className="like-btn" type="button" onClick={() => swipe('like')}>
                Swipe Right
              </button>
            </div>
            <div className="quick-share-strip">
              <p className="song-artist">{songShareHint}</p>
              <button
                className="mini-btn"
                type="button"
                onClick={() => handleSendSong(currentTrack)}
                disabled={!canMessageSelectedUser}
              >
                {selectedUser ? `Send to ${selectedUser.name}` : 'Send song'}
              </button>
            </div>
          </section>
        </main>
      )}

      {tab === 'liked' && (
        <main className="panel-main">
          <h2 className="panel-title">Liked Music</h2>
          {likedSongs.length === 0 ? (
            <p className="empty-text">Swipe right in Discover to build your liked music list.</p>
          ) : (
            <div className="list">
              {likedSongs.map((song) => (
                <article key={song.id} className="list-row">
                  {song.artworkUrl && <img src={song.artworkUrl} alt="" className="result-artwork" />}
                  <div className="result-meta">
                    <span className="song-title">{song.title}</span>
                    <span className="song-artist">
                      {song.artist}
                      {song.album ? ` • ${song.album}` : ''}
                    </span>
                  </div>
                  <div className="list-row-actions">
                    <button className="mini-btn list-row-action" type="button" onClick={() => handlePlay(song)}>
                      {activeId === song.id ? 'Pause Clip' : 'Play Clip'}
                    </button>
                    <button
                      className="mini-btn list-row-action"
                      type="button"
                      onClick={() => handleSendSong(song)}
                      disabled={!canMessageSelectedUser}
                    >
                      Send song
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      )}

      {tab === 'dating' && (
        <main className="swipe-main">
          {socialError && <p className="error-text">{socialError}</p>}
          <section className="deck">
            <section className="dating-filters">
              <p className="song-artist">Compatibility filters</p>
              <div className="chips-row dating-filter-row">
                {(['all', '18-24', '25-30', '31-38', '39+'] as DatingAgeFilter[]).map((range) => (
                  <button
                    key={range}
                    type="button"
                    className={`chip ${datingAgeFilter === range ? 'chip-selected' : ''}`}
                    onClick={() => setDatingAgeFilter(range)}
                  >
                    {range === 'all' ? 'Any age' : range}
                  </button>
                ))}
              </div>
              <div className="chips-row dating-filter-row">
                {(['all', ...DATING_GENDER_OPTIONS] as DatingGenderFilter[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`chip ${datingGenderFilter === option ? 'chip-selected' : ''}`}
                    onClick={() => setDatingGenderFilter(option)}
                  >
                    {option === 'all'
                      ? 'Any gender'
                      : option === 'would rather not say'
                        ? 'Would rather not say'
                        : option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
              <div className="chips-row dating-filter-row">
                {DATING_MOOD_OPTIONS.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    className={`chip ${datingMoodFilters.includes(mood) ? 'chip-selected' : ''}`}
                    onClick={() => toggleDatingMoodFilter(mood)}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </section>
            {!activeDatingCandidate ? (
              <article className="swipe-card dating-card-empty">
                <div className="cover-meta dating-meta">
                  <h2 className="card-title">No more profiles for now</h2>
                  <p className="card-artist">
                    You went through all available profiles for these filters.
                  </p>
                  {datingMatchedUserIds.length > 0 && (
                    <p className="card-album">
                      {datingMatchedUserIds.length} music match
                      {datingMatchedUserIds.length === 1 ? '' : 'es'} unlocked.
                    </p>
                  )}
                </div>
              </article>
            ) : (
              <article
                className="swipe-card dating-swipe-card"
                style={{
                  transform: `translateX(${datingDragX}px) rotate(${datingDragX / 18}deg)`,
                }}
                onPointerDown={(event) => setDatingDragStartX(event.clientX)}
                onPointerMove={(event) => {
                  if (datingDragStartX === null) return
                  setDatingDragX(event.clientX - datingDragStartX)
                }}
                onPointerUp={() => {
                  if (datingDragX > 90) {
                    handleDatingSwipe('like')
                  } else if (datingDragX < -90) {
                    handleDatingSwipe('dislike')
                  } else {
                    setDatingDragX(0)
                  }
                  setDatingDragStartX(null)
                }}
                onPointerCancel={() => {
                  setDatingDragStartX(null)
                  setDatingDragX(0)
                }}
              >
                <img src={activeDatingCandidate.candidate.profileImageUrl} alt="" className="card-artwork" />
                <div className="card-overlay-gradient" />
                {datingSwipeLabel && (
                  <div
                    className={`swipe-chip ${datingSwipeLabel === 'LIKE' ? 'swipe-like' : 'swipe-pass'}`}
                  >
                    {datingSwipeLabel}
                  </div>
                )}
                <div className="compat-pill">
                  {activeDatingCandidate.compatibility.score}% compatible
                  {activeDatingCandidate.compatibility.score >= 88
                    ? ' · excellent match'
                    : activeDatingCandidate.compatibility.score >= 76
                      ? ' · great match'
                      : activeDatingCandidate.compatibility.score >= 62
                        ? ' · good potential'
                        : ' · music wildcard'}
                </div>
                <div className="cover-meta dating-meta">
                  <h2 className="card-title">
                    {activeDatingCandidate.candidate.name}
                    {typeof activeDatingCandidate.candidate.age === 'number'
                      ? `, ${activeDatingCandidate.candidate.age}`
                      : ''}
                  </h2>
                  <p className="card-artist">@{activeDatingCandidate.candidate.handle}</p>
                  <p className="card-album">
                    {activeDatingCandidate.candidate.bio || 'No bio yet. Let the music speak first.'}
                  </p>
                  <p className="song-artist">
                    Shared songs: {activeDatingCandidate.compatibility.sharedTracks.length} · Shared artists:{' '}
                    {activeDatingCandidate.compatibility.sharedArtists.length}
                  </p>
                  {activeDatingCandidate.compatibility.sharedMoods.length > 0 && (
                    <p className="song-artist">
                      Shared vibes: {activeDatingCandidate.compatibility.sharedMoods.join(' · ')}
                    </p>
                  )}
                  {activeDatingCandidate.compatibility.sharedTracks.length > 0 && (
                    <div className="chips-row dating-shared-row">
                      {activeDatingCandidate.compatibility.sharedTracks.slice(0, 3).map((track) => (
                        <span key={`${activeDatingCandidate.candidate.id}-${track.id}`} className="chip">
                          {track.title} · {track.artist}
                        </span>
                      ))}
                    </div>
                  )}
                  {activeDatingCandidate.candidate.likedMusic.length > 0 && (
                    <p className="song-artist">
                      Recent likes: {activeDatingCandidate.candidate.likedMusic.slice(0, 3).map((song) => song.title).join(' · ')}
                    </p>
                  )}
                </div>
              </article>
            )}
            <div className="swipe-controls">
              <button className="pass-btn" type="button" onClick={() => handleDatingSwipe('dislike')}>
                Pass
              </button>
              <button
                className="like-btn"
                type="button"
                onClick={() => handleDatingSwipe('like')}
                disabled={!viewer.matchOpen}
              >
                Like Profile
              </button>
            </div>
          </section>
        </main>
      )}

      {tab === 'photos' && (
        <main className="panel-main">
          <section className="selected-user-card photo-compose-card">
            <div className="result-meta">
              <h3>Post for people who liked you</h3>
              <p className="song-artist">
                Only people who liked your profile can see these photos.
              </p>
            </div>
          </section>
          {photoThreadError && <p className="error-text">{photoThreadError}</p>}
          <section className="photo-compose-form">
            <input
              ref={photoThreadInputRef}
              className="search-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePhotoDraftFileChange}
            />
            <input
              className="search-input"
              value={photoDraftCaption}
              onChange={(e) => setPhotoDraftCaption(e.target.value)}
              placeholder="Add a short caption (optional)"
              maxLength={180}
            />
            {photoDraftData && (
              <>
                <div
                  ref={photoEditorRef}
                  className="photo-editor-stage"
                  onPointerDown={handlePhotoMarkupPointerDown}
                  onPointerMove={handlePhotoMarkupPointerMove}
                  onPointerUp={finishPhotoMarkupStroke}
                  onPointerCancel={finishPhotoMarkupStroke}
                >
                  <img
                    src={photoDraftData}
                    alt="Post preview"
                    className="photo-editor-image"
                    style={{
                      filter: activePhotoFilter,
                      transform: activePhotoTransform,
                    }}
                  />
                  {photoOverlayPreset !== 'none' && (
                    <div
                      className="photo-editor-overlay"
                      style={{
                        opacity: photoOverlayOpacity / 100,
                        background: `linear-gradient(135deg, ${activeOverlayStops[0]}, ${activeOverlayStops[1]}, ${activeOverlayStops[2]})`,
                      }}
                    />
                  )}
                  {photoTextOverlay.trim() && (
                    <p
                      className="photo-editor-text"
                      style={{
                        color: photoTextColor,
                        fontSize: `${photoTextSize}px`,
                        left: `${photoTextX}%`,
                        top: `${photoTextY}%`,
                      }}
                    >
                      {photoTextOverlay.trim()}
                    </p>
                  )}
                  <svg className="photo-editor-markup" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {[...photoMarkupStrokes, ...(drawingPhotoStroke ? [drawingPhotoStroke] : [])].map((stroke) => (
                      <polyline
                        key={stroke.id}
                        points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
                        fill="none"
                        stroke={stroke.color}
                        strokeWidth={Math.max(0.5, stroke.size / 2.2)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </svg>
                </div>

                <div className="photo-tools-grid">
                  <div className="photo-tool-card">
                    <button
                      className={`photo-tool-toggle ${photoOpenTool === 'filters' ? 'photo-tool-toggle-active' : ''}`}
                      type="button"
                      onClick={() => setPhotoOpenTool((prev) => (prev === 'filters' ? 'none' : 'filters'))}
                    >
                      Filters
                    </button>
                    {photoOpenTool === 'filters' && (
                      <div className="photo-tool-body">
                        <div className="chips-row">
                          {PHOTO_FILTER_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className={`chip ${photoFilterPreset === preset.id ? 'chip-selected' : ''}`}
                              onClick={() => setPhotoFilterPreset(preset.id)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="photo-tool-card">
                    <button
                      className={`photo-tool-toggle ${photoOpenTool === 'edit' ? 'photo-tool-toggle-active' : ''}`}
                      type="button"
                      onClick={() => setPhotoOpenTool((prev) => (prev === 'edit' ? 'none' : 'edit'))}
                    >
                      Edit
                    </button>
                    {photoOpenTool === 'edit' && (
                      <div className="photo-tool-body">
                        <div className="photo-slider-grid">
                          <label className="photo-range-label">
                            Brightness
                            <input type="range" min={70} max={140} value={photoBrightness} onChange={(e) => setPhotoBrightness(Number(e.target.value))} />
                          </label>
                          <label className="photo-range-label">
                            Contrast
                            <input type="range" min={70} max={150} value={photoContrast} onChange={(e) => setPhotoContrast(Number(e.target.value))} />
                          </label>
                          <label className="photo-range-label">
                            Saturation
                            <input type="range" min={40} max={180} value={photoSaturation} onChange={(e) => setPhotoSaturation(Number(e.target.value))} />
                          </label>
                          <label className="photo-range-label">
                            Blur
                            <input type="range" min={0} max={5} step={0.2} value={photoBlur} onChange={(e) => setPhotoBlur(Number(e.target.value))} />
                          </label>
                          <label className="photo-range-label">
                            Zoom
                            <input type="range" min={85} max={145} value={photoZoom} onChange={(e) => setPhotoZoom(Number(e.target.value))} />
                          </label>
                          <label className="photo-range-label">
                            Rotation
                            <input type="range" min={-20} max={20} value={photoRotation} onChange={(e) => setPhotoRotation(Number(e.target.value))} />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="photo-tool-card">
                    <button
                      className={`photo-tool-toggle ${photoOpenTool === 'words' ? 'photo-tool-toggle-active' : ''}`}
                      type="button"
                      onClick={() => setPhotoOpenTool((prev) => (prev === 'words' ? 'none' : 'words'))}
                    >
                      Words + overlays
                    </button>
                    {photoOpenTool === 'words' && (
                      <div className="photo-tool-body">
                        <input
                          className="search-input"
                          value={photoTextOverlay}
                          onChange={(e) => setPhotoTextOverlay(e.target.value)}
                          placeholder="Add text on top of your post"
                          maxLength={80}
                        />
                        <div className="photo-inline-controls">
                          <label className="photo-color-label">
                            Text color
                            <input type="color" value={photoTextColor} onChange={(e) => setPhotoTextColor(e.target.value)} />
                          </label>
                          <label className="photo-range-label">
                            Size
                            <input type="range" min={16} max={52} value={photoTextSize} onChange={(e) => setPhotoTextSize(Number(e.target.value))} />
                          </label>
                        </div>
                        <div className="photo-slider-grid">
                          <label className="photo-range-label">
                            Text X
                            <input type="range" min={5} max={95} value={photoTextX} onChange={(e) => setPhotoTextX(Number(e.target.value))} />
                          </label>
                          <label className="photo-range-label">
                            Text Y
                            <input type="range" min={8} max={92} value={photoTextY} onChange={(e) => setPhotoTextY(Number(e.target.value))} />
                          </label>
                        </div>
                        <div className="chips-row">
                          {PHOTO_OVERLAY_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className={`chip ${photoOverlayPreset === preset.id ? 'chip-selected' : ''}`}
                              onClick={() => setPhotoOverlayPreset(preset.id)}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <label className="photo-range-label">
                          Overlay strength
                          <input
                            type="range"
                            min={0}
                            max={85}
                            value={photoOverlayOpacity}
                            onChange={(e) => setPhotoOverlayOpacity(Number(e.target.value))}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="photo-tool-card">
                    <button
                      className={`photo-tool-toggle ${photoOpenTool === 'markup' ? 'photo-tool-toggle-active' : ''}`}
                      type="button"
                      onClick={() => setPhotoOpenTool((prev) => (prev === 'markup' ? 'none' : 'markup'))}
                    >
                      Mark-up (draw on preview)
                    </button>
                    {photoOpenTool === 'markup' && (
                      <div className="photo-tool-body">
                        <div className="photo-inline-controls">
                          <label className="photo-color-label">
                            Pen color
                            <input type="color" value={photoMarkupColor} onChange={(e) => setPhotoMarkupColor(e.target.value)} />
                          </label>
                          <label className="photo-range-label">
                            Pen size
                            <input type="range" min={2} max={20} value={photoMarkupSize} onChange={(e) => setPhotoMarkupSize(Number(e.target.value))} />
                          </label>
                        </div>
                        <div className="photo-inline-controls">
                          <button
                            className="mini-btn"
                            type="button"
                            onClick={() => setPhotoMarkupStrokes((prev) => prev.slice(0, -1))}
                            disabled={!photoMarkupStrokes.length}
                          >
                            Undo Markup
                          </button>
                          <button
                            className="mini-btn"
                            type="button"
                            onClick={() => {
                              setPhotoMarkupStrokes([])
                              setDrawingPhotoStroke(null)
                            }}
                            disabled={!photoMarkupStrokes.length && !drawingPhotoStroke}
                          >
                            Clear Markup
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="photo-tool-card">
                    <button
                      className={`photo-tool-toggle ${photoOpenTool === 'clip' ? 'photo-tool-toggle-active' : ''}`}
                      type="button"
                      onClick={() => setPhotoOpenTool((prev) => (prev === 'clip' ? 'none' : 'clip'))}
                    >
                      Song clip
                    </button>
                    {photoOpenTool === 'clip' && (
                      <div className="photo-tool-body">
                        <input
                          className="search-input"
                          value={photoClipQuery}
                          onChange={(e) => setPhotoClipQuery(e.target.value)}
                          placeholder="Search a clip to attach"
                        />
                        {photoClipQuery.trim() && (
                          <div className="search-results">
                            {photoClipLoading ? (
                              <p className="empty-text global-search-message">Searching song clips...</p>
                            ) : photoClipError ? (
                              <p className="error-text global-search-message">{photoClipError}</p>
                            ) : photoClipResults.length === 0 ? (
                              <p className="empty-text global-search-message">No clips found.</p>
                            ) : (
                              photoClipResults.map((song) => (
                                <button
                                  key={`photo-clip-result-${song.id}`}
                                  className={`result-row ${selectedPhotoClip?.id === song.id ? 'result-row-selected' : ''}`}
                                  type="button"
                                  onClick={() => {
                                    setSelectedPhotoClip(song)
                                    setPhotoClipQuery('')
                                    setPhotoClipResults([])
                                    setPhotoClipError(null)
                                    setPhotoClipStartTime(0)
                                    setPhotoClipDuration(15)
                                  }}
                                >
                                  {song.artworkUrl && <img src={song.artworkUrl} alt="" className="result-artwork" />}
                                  <span className="result-meta">
                                    <span className="song-title">{song.title}</span>
                                    <span className="song-artist">{song.artist}</span>
                                  </span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                        {selectedPhotoClip && (
                          <div className="photo-clip-selected">
                            <p className="song-title">{selectedPhotoClip.title}</p>
                            <p className="song-artist">
                              {selectedPhotoClip.artist} · {formatSeconds(photoClipStartTime)}-{formatSeconds(photoClipStartTime + photoClipDuration)}
                            </p>
                            <label className="photo-range-label">
                              Clip start
                              <input
                                type="range"
                                min={0}
                                max={Math.max(0, PHOTO_CLIP_PREVIEW_SECONDS - photoClipDuration)}
                                value={photoClipStartTime}
                                onChange={(e) => setPhotoClipStartTime(Number(e.target.value))}
                              />
                            </label>
                            <label className="photo-range-label">
                              Clip duration
                              <input
                                type="range"
                                min={5}
                                max={Math.max(5, PHOTO_CLIP_PREVIEW_SECONDS - photoClipStartTime)}
                                value={photoClipDuration}
                                onChange={(e) => setPhotoClipDuration(Number(e.target.value))}
                              />
                            </label>
                            <div className="photo-inline-controls">
                              <button className="mini-btn" type="button" onClick={handlePlayPhotoClip}>
                                {activeId === `photo-clip-${selectedPhotoClip.id}` ? 'Pause clip' : 'Preview clip'}
                              </button>
                              <button className="mini-btn" type="button" onClick={() => setSelectedPhotoClip(null)}>
                                Remove clip
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            <button className="primary-btn" type="button" onClick={handleCreatePhotoPost} disabled={postingPhoto}>
              {postingPhoto ? 'Posting...' : photoDraftData ? 'Post Edited Photo' : 'Post Photo'}
            </button>
            <button
              className="mini-btn"
              type="button"
              onClick={() => resetPhotoDraftComposer(true)}
              disabled={!photoDraftData || postingPhoto}
            >
              Delete draft
            </button>
          </section>

          <section className="deck">
            {!activePhotoPost ? (
              <article className="swipe-card dating-card-empty">
                <div className="cover-meta dating-meta">
                  <h2 className="card-title">No photos yet</h2>
                  <p className="card-artist">
                    Like more profiles and they can share private photos here.
                  </p>
                </div>
              </article>
            ) : (
              <article
                ref={photoPostCardRef}
                className="swipe-card photo-post-card"
                style={{ transform: `translateX(${photoDragX}px) rotate(${photoDragX / 22}deg)` }}
                onPointerDown={(event) => setPhotoDragStartX(event.clientX)}
                onPointerMove={(event) => {
                  if (photoDragStartX === null) return
                  setPhotoDragX(event.clientX - photoDragStartX)
                }}
                onPointerUp={() => {
                  if (photoDragX > 90) {
                    stepPhotoThread('next')
                  } else if (photoDragX < -90) {
                    stepPhotoThread('next')
                  } else {
                    setPhotoDragX(0)
                  }
                  setPhotoDragStartX(null)
                }}
                onPointerCancel={() => {
                  setPhotoDragStartX(null)
                  setPhotoDragX(0)
                }}
              >
                <div className="photo-post-media">
                  <img src={activePhotoPost.imageUrl} alt="" className="card-artwork" />
                  {activePhotoPost.clip?.previewUrl && (
                    <button
                      className="post-mute-btn"
                      type="button"
                      onClick={() => setPhotoPostsMuted((prev) => !prev)}
                      aria-pressed={photoPostsMuted}
                    >
                      {photoPostsMuted ? 'Unmute' : 'Mute'}
                    </button>
                  )}
                  {photoSwipeLabel && (
                    <div className={`swipe-chip ${photoSwipeLabel === 'NEXT' ? 'swipe-like' : 'swipe-pass'}`}>
                      {photoSwipeLabel}
                    </div>
                  )}
                </div>
                <div className="photo-post-meta">
                  <p className="song-artist">
                    {activePhotoPost.author ? `${activePhotoPost.author.name} · @${activePhotoPost.author.handle}` : 'Unknown'}
                  </p>
                  {activePhotoCaption ? <p className="card-artist">{activePhotoCaption}</p> : null}
                  {activePhotoPost.clip && (
                    <div className="photo-post-clip-meta">
                      <p className="song-title">{activePhotoPost.clip.title}</p>
                      <p className="song-artist">
                        {activePhotoPost.clip.artist}
                        {activePhotoPost.clip.album ? ` • ${activePhotoPost.clip.album}` : ''}
                      </p>
                    </div>
                  )}
                </div>
              </article>
            )}
            <div className="swipe-controls">
              <button className="pass-btn" type="button" onClick={() => stepPhotoThread('back')}>
                Previous
              </button>
              <button className="like-btn" type="button" onClick={() => stepPhotoThread('next')}>
                Next
              </button>
            </div>
          </section>
        </main>
      )}

      {tab === 'community' && (
        <main className="community-main">
          {socialError && <p className="error-text">{socialError}</p>}
          <section className="selected-user-card">
            <img src={viewer.profileImageUrl} alt="" className="avatar-thumb" />
            <div>
              <h3>@{viewer.handle}</h3>
              <p className="song-artist">
                Match mode: {viewer.matchOpen ? 'Open (you can match)' : 'Closed (just listening)'}
              </p>
            </div>
            <div className="stack-actions">
              <button className="mini-btn" type="button" onClick={() => profilePhotoInputRef.current?.click()} disabled={updatingProfilePhoto}>
                {updatingProfilePhoto ? 'Updating...' : 'Change photo'}
              </button>
              <button
                className={viewer.matchOpen ? 'like-btn' : 'pass-btn'}
                type="button"
                onClick={handleMatchModeToggle}
              >
                {viewer.matchOpen ? 'Set Closed' : 'Set Open'}
              </button>
            </div>
            <input
              ref={profilePhotoInputRef}
              className="hidden-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleProfilePhotoUpdate}
            />
          </section>
          <section className="community-users">
            <h2 className="panel-title">Liked your profile</h2>
            {likedYouUsers.length === 0 ? (
              <p className="empty-text">No profile likes yet. Keep swiping and updating your music vibe.</p>
            ) : (
              <div className="list">
                {likedYouUsers.map((user) => (
                  <article key={`liked-you-${user.id}`} className="list-row">
                    <img src={user.profileImageUrl} alt="" className="avatar-thumb" />
                    <div className="result-meta">
                      <span className="song-title">
                        {user.name} <span className="user-handle">@{user.handle}</span>
                      </span>
                      <span className="song-artist">
                        {user.isMatched ? 'Matched' : user.isFollowing ? 'You both liked each other' : 'Liked your profile'}
                      </span>
                    </div>
                    <div className="list-row-actions">
                      <button
                        className="mini-btn list-row-action"
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        View
                      </button>
                      <button
                        className={`mini-btn list-row-action ${user.isFollowing ? 'pass-btn' : 'like-btn'}`}
                        type="button"
                        onClick={() => handleFollowToggle(user)}
                        disabled={!viewer.matchOpen}
                      >
                        {user.isFollowing ? 'Following' : 'Follow back'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="community-users">
            <h2 className="panel-title">People</h2>
            <div className="list">
              {socialUsers.map((user) => (
                <button
                  key={user.id}
                  className={`user-row ${selectedUserId === user.id ? 'user-row-active' : ''}`}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <img src={user.profileImageUrl} alt="" className="avatar-thumb" />
                  <div className="result-meta">
                    <span className="song-title">
                      {user.name} <span className="user-handle">@{user.handle}</span>
                    </span>
                    <span className="song-artist">{user.bio}</span>
                  </div>
                  <span className="result-badge">{user.likedMusic.length} likes</span>
                </button>
              ))}
            </div>
          </section>

          {selectedUser && (
            <>
              <section className="selected-user-card">
                <img src={selectedUser.profileImageUrl} alt="" className="avatar-thumb" />
                <div>
                  <h3>{selectedUser.name}</h3>
                  <p className="song-artist">@{selectedUser.handle}</p>
                  <p className="song-artist">
                    {selectedUser.age === null
                      ? 'Age visible to followers only'
                      : `Age: ${selectedUser.age}`}
                  </p>
                  <p className="song-artist">
                    Match mode: {selectedUser.matchOpen ? 'Open' : 'Closed'}
                    {selectedUser.isMatched ? ' · Matched' : ''}
                  </p>
                </div>
                <button
                  className={selectedUser.isFollowing ? 'pass-btn' : 'like-btn'}
                  type="button"
                  onClick={() => handleFollowToggle(selectedUser)}
                  disabled={!viewer.matchOpen}
                >
                  {selectedUser.isFollowing ? 'Following' : 'Follow'}
                </button>
              </section>

              <section className="community-likes">
                <h3 className="section-title">{selectedUser.name}'s liked music</h3>
                {selectedUser.likedMusic.length === 0 ? (
                  <p className="empty-text">No likes yet.</p>
                ) : (
                  <div className="list">
                    {selectedUser.likedMusic.map((song) => (
                      <article key={`${selectedUser.id}-${song.id}`} className="list-row">
                        {song.artworkUrl && (
                          <img src={song.artworkUrl} alt="" className="result-artwork" />
                        )}
                        <div className="result-meta">
                          <span className="song-title">{song.title}</span>
                          <span className="song-artist">{song.artist}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="community-chat">
                <h3 className="section-title">Message {selectedUser.name}</h3>
                <div className="chat-box">
                  {messages.length === 0 ? (
                    <p className="empty-text">No messages yet. Say hi.</p>
                  ) : (
                    messages.map((message) => {
                      const sharedTrack = message.sharedTrack
                      return (
                        <div
                          key={message.id}
                          className={`chat-bubble ${message.fromId === viewer.id ? 'chat-me' : 'chat-them'}`}
                        >
                          {message.text && <span>{message.text}</span>}
                          {sharedTrack && (
                            <button
                              className="chat-track-card"
                              type="button"
                              onClick={() => handlePlay(sharedTrack)}
                              disabled={!sharedTrack.previewUrl}
                            >
                              {sharedTrack.artworkUrl && (
                                <img src={sharedTrack.artworkUrl} alt="" className="result-artwork" />
                              )}
                              <span className="chat-track-meta">
                                <span className="song-title">{sharedTrack.title}</span>
                                <span className="song-artist">
                                  {sharedTrack.artist}
                                  {sharedTrack.album ? ` • ${sharedTrack.album}` : ''}
                                </span>
                              </span>
                              <span className="result-badge">
                                {activeId === sharedTrack.id ? 'Pause Clip' : 'Play Clip'}
                              </span>
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
                <div className="song-share-list">
                  <p className="song-artist">Share one of your liked songs</p>
                  {likedSongs.length === 0 ? (
                    <p className="empty-text">
                      Like songs in Discover first, then send them to people you match with.
                    </p>
                  ) : (
                    <div className="list">
                      {likedSongs.slice(0, 6).map((song) => (
                        <article key={`share-${song.id}`} className="list-row">
                          {song.artworkUrl && <img src={song.artworkUrl} alt="" className="result-artwork" />}
                          <div className="result-meta">
                            <span className="song-title">{song.title}</span>
                            <span className="song-artist">
                              {song.artist}
                              {song.album ? ` • ${song.album}` : ''}
                            </span>
                          </div>
                          <button
                            className="mini-btn list-row-action"
                            type="button"
                            onClick={() => handleSendSong(song)}
                            disabled={!canMessageSelectedUser}
                          >
                            Send song
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                <form className="chat-form" onSubmit={handleSendMessage}>
                  <input
                    className="search-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message"
                    disabled={!canMessageSelectedUser}
                  />
                  <button
                    className="primary-btn"
                    type="submit"
                    disabled={!canMessageSelectedUser}
                  >
                    Send
                  </button>
                </form>
              </section>
            </>
          )}
        </main>
      )}

      {tab === 'profiles' && (
        <main className="community-main">
          {profileError && <p className="error-text">{profileError}</p>}
          <section className="community-users">
            <h2 className="panel-title">User profiles</h2>
            <p className="song-artist messages-intro">
              Open any profile to see posts, matches, and messages.
            </p>
            <div className="list">
              {profileDirectory.map((user) => (
                <button
                  key={`profile-picker-${user.id}`}
                  className={`user-row ${activeProfileUser?.id === user.id ? 'user-row-active' : ''}`}
                  type="button"
                  onClick={() => setProfileUserId(user.id)}
                >
                  <img src={user.profileImageUrl} alt="" className="avatar-thumb" />
                  <div className="result-meta">
                    <span className="song-title">
                      {user.name} <span className="user-handle">@{user.handle}</span>
                    </span>
                    <span className="song-artist">{user.id === viewer.id ? 'You' : 'Open profile'}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {isGigiProfile && (
            <section className="community-users">
              <h3 className="section-title">All users info (without password/birthday)</h3>
              <div className="list">
                {allUsersForGigi.map((user) => (
                  <article key={`gigi-user-info-${user.id}`} className="list-row">
                    <img src={user.profileImageUrl} alt="" className="avatar-thumb" />
                    <div className="result-meta">
                      <span className="song-title">
                        {user.name} <span className="user-handle">@{user.handle}</span>
                      </span>
                      <span className="song-artist">
                        ID: {user.id} · Age: {user.age ?? 'Unknown'} · Gender: {user.gender}
                      </span>
                      <span className="song-artist">
                        Match mode: {user.matchOpen ? 'Open' : 'Closed'} · Likes: {user.likedSongsCount}
                      </span>
                      <span className="song-artist">{user.bio || 'No bio yet.'}</span>
                      {user.isFollowing !== null && (
                        <span className="song-artist">
                          Following: {user.isFollowing ? 'Yes' : 'No'} · Follows you:{' '}
                          {user.followsYou ? 'Yes' : 'No'} · Matched: {user.isMatched ? 'Yes' : 'No'}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {profileLoading ? (
            <p className="empty-text">Loading profile...</p>
          ) : profileDetails ? (
            <>
              <section className="selected-user-card">
                <img src={profileDetails.profile.profileImageUrl} alt="" className="avatar-thumb" />
                <div>
                  <h3>{profileDetails.profile.name}</h3>
                  <p className="song-artist">@{profileDetails.profile.handle}</p>
                  <p className="song-artist">{profileDetails.profile.bio || 'No bio yet.'}</p>
                  <p className="song-artist">
                    Match mode: {profileDetails.profile.matchOpen ? 'Open' : 'Closed'}
                    {profileDetails.profile.isMatched ? ' · Matched with you' : ''}
                  </p>
                </div>
              </section>

              <section className="community-users">
                <h3 className="section-title">Posts</h3>
                {profileDetails.posts.length === 0 ? (
                  <p className="empty-text">No posts to show yet.</p>
                ) : (
                  <div className="list">
                    {profileDetails.posts.map((post) => (
                      <article key={`profile-post-${post.id}`} className="list-row">
                        <img src={post.imageUrl} alt="" className="profile-post-thumb" />
                        <div className="result-meta">
                          <span className="song-title">{post.caption || 'Photo post'}</span>
                          <span className="song-artist">
                            {new Date(post.createdAt).toLocaleString()}
                            {post.clip ? ` · Clip: ${post.clip.title} - ${post.clip.artist}` : ''}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="community-users">
                <h3 className="section-title">Matches</h3>
                {profileDetails.matches.length === 0 ? (
                  <p className="empty-text">No matches yet.</p>
                ) : (
                  <div className="list">
                    {profileDetails.matches.map((matchUser) => (
                      <button
                        key={`profile-match-${matchUser.id}`}
                        className="user-row"
                        type="button"
                        onClick={() => setProfileUserId(matchUser.id)}
                      >
                        <img src={matchUser.profileImageUrl} alt="" className="avatar-thumb" />
                        <div className="result-meta">
                          <span className="song-title">
                            {matchUser.name} <span className="user-handle">@{matchUser.handle}</span>
                          </span>
                          <span className="song-artist">View profile</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="community-chat">
                <h3 className="section-title">Messages</h3>
                {profileDetails.messages.length === 0 ? (
                  <p className="empty-text">No messages yet.</p>
                ) : (
                  <div className="chat-box">
                    {profileDetails.messages.map((message) => (
                      <div
                        key={`profile-msg-${message.id}`}
                        className={`chat-bubble ${message.fromId === viewer.id ? 'chat-me' : 'chat-them'}`}
                      >
                        <span>
                          {message.withUser ? `With ${message.withUser.name}: ` : ''}
                          {message.text}
                        </span>
                        {message.sharedTrack && (
                          <span className="song-artist">
                            Shared: {message.sharedTrack.title} - {message.sharedTrack.artist}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </main>
      )}

      {tab === 'messages' && (
        <main className="community-main">
          {socialError && <p className="error-text">{socialError}</p>}
          <section className="community-users">
            <h2 className="panel-title">Messaging</h2>
            <p className="song-artist messages-intro">
              Mutual followers and matches only. Sent songs appear in each thread.
            </p>
            {messagingConnections.length === 0 ? (
              <p className="empty-text">
                No mutual followers yet. Follow each other first, then open match mode to start chatting.
              </p>
            ) : (
              <div className="list">
                {messagingConnections.map((user) => (
                  <button
                    key={`message-${user.id}`}
                    className={`user-row ${selectedUserId === user.id ? 'user-row-active' : ''}`}
                    type="button"
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    <img src={user.profileImageUrl} alt="" className="avatar-thumb" />
                    <div className="result-meta">
                      <span className="song-title">
                        {user.name} <span className="user-handle">@{user.handle}</span>
                      </span>
                      <span className="song-artist">
                        {user.isMatched ? 'Matched' : 'Mutual follower'} · {user.likedMusic.length} likes
                      </span>
                    </div>
                    <span className="result-badge">{user.isMatched ? 'Can message' : 'Waiting match open'}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {selectedUser && messagingConnections.some((user) => user.id === selectedUser.id) && (
            <section className="community-chat">
              <h3 className="section-title">Message {selectedUser.name}</h3>
              {!selectedUser.isMatched && (
                <p className="empty-text">Both of you need match mode open before messages can be sent.</p>
              )}
              <div className="chat-box">
                {messages.length === 0 ? (
                  <p className="empty-text">No messages yet. Say hi.</p>
                ) : (
                  messages.map((message) => {
                    const sharedTrack = message.sharedTrack
                    return (
                      <div
                        key={`message-thread-${message.id}`}
                        className={`chat-bubble ${message.fromId === viewer.id ? 'chat-me' : 'chat-them'}`}
                      >
                        {message.text && <span>{message.text}</span>}
                        {sharedTrack && (
                          <button
                            className="chat-track-card"
                            type="button"
                            onClick={() => handlePlay(sharedTrack)}
                            disabled={!sharedTrack.previewUrl}
                          >
                            {sharedTrack.artworkUrl && (
                              <img src={sharedTrack.artworkUrl} alt="" className="result-artwork" />
                            )}
                            <span className="chat-track-meta">
                              <span className="song-title">{sharedTrack.title}</span>
                              <span className="song-artist">
                                {sharedTrack.artist}
                                {sharedTrack.album ? ` • ${sharedTrack.album}` : ''}
                              </span>
                            </span>
                            <span className="result-badge">
                              {activeId === sharedTrack.id ? 'Pause Clip' : 'Play Clip'}
                            </span>
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
              <div className="song-share-list">
                <p className="song-artist">Share one of your liked songs</p>
                {likedSongs.length === 0 ? (
                  <p className="empty-text">
                    Like songs in Discover first, then send them to people you match with.
                  </p>
                ) : (
                  <div className="list">
                    {likedSongs.slice(0, 6).map((song) => (
                      <article key={`message-share-${song.id}`} className="list-row">
                        {song.artworkUrl && <img src={song.artworkUrl} alt="" className="result-artwork" />}
                        <div className="result-meta">
                          <span className="song-title">{song.title}</span>
                          <span className="song-artist">
                            {song.artist}
                            {song.album ? ` • ${song.album}` : ''}
                          </span>
                        </div>
                        <button
                          className="mini-btn list-row-action"
                          type="button"
                          onClick={() => handleSendSong(song)}
                          disabled={!canMessageSelectedUser}
                        >
                          Send song
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <form className="chat-form" onSubmit={handleSendMessage}>
                <input
                  className="search-input"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message"
                  disabled={!canMessageSelectedUser}
                />
                <button className="primary-btn" type="submit" disabled={!canMessageSelectedUser}>
                  Send
                </button>
              </form>
            </section>
          )}
        </main>
      )}
    </div>
  )
}

export default App
