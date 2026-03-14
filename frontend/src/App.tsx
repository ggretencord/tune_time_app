import { useEffect, useMemo, useRef, useState } from 'react'
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

type SurveySeed = {
  id: string
  title: string
  artist: string
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
  matchOpen: boolean
  profileImageUrl: string
  isMatched: boolean
  likedMusic: Track[]
  isFollowing: boolean
}

type ChatMessage = {
  id: string
  fromId: string
  toId: string
  text: string
  sentAt: number
}

type ViewerAccount = {
  id: string
  name: string
  handle: string
  bio: string
  age: number
  matchOpen: boolean
  profileImageUrl: string
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

type PhotoPost = {
  id: string
  authorId: string
  imageUrl: string
  caption: string
  createdAt: number
  author: {
    id: string
    name: string
    handle: string
    profileImageUrl: string
  } | null
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const SESSION_STORAGE_KEY = 'tune_time_session_token'
const DATING_MOOD_OPTIONS = ['chill', 'hype', 'sad', 'focus', 'party', 'romantic'] as const

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

function uniqueLowercase(values: string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))
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
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [birthday, setBirthday] = useState('')
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
    if (!name.trim() || !handle.trim() || !birthday || !password) {
      setError('Name, handle, birthday, and password are required.')
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
          handle: handle.trim(),
          bio: bio.trim(),
          birthday,
          matchOpen,
          password,
          profileImageData: profilePhotoData,
        }),
      })
      const data = (await res.json()) as {
        error?: string
        user?: ViewerAccount
        sessionToken?: string
      }
      if (!res.ok || !data.user || !data.sessionToken) {
        throw new Error(data.error || 'Could not create account')
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
      const data = (await res.json()) as {
        error?: string
        user?: ViewerAccount
        sessionToken?: string
      }
      if (!res.ok || !data.user || !data.sessionToken) {
        throw new Error(data.error || 'Could not sign in')
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
        <span className="brand">Tune Time</span>
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
              Birthday and profile photo are required. You can change your photo any time.
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
}

function SurveyScreen({ sessionToken, onDone }: SurveyProps) {
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
      return [...prev, { id: track.id, title: track.title, artist: track.artist }]
    })
  }

  function toggleMood(mood: string) {
    setMoods((prev) =>
      prev.includes(mood) ? prev.filter((m) => m !== mood) : [...prev, mood],
    )
  }

  async function handleSubmit() {
    if (!selected.length) {
      setError('Pick at least one song to start.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/survey`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({ seeds: selected, moods }),
      })
      if (!res.ok) {
        throw new Error('Survey submit failed')
      }
      onDone()
    } catch {
      setError('Could not save your preferences. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const moodOptions = ['chill', 'hype', 'sad', 'focus', 'party', 'romantic']

  return (
    <div className="screen survey-screen">
      <header className="top-bar">
        <span className="brand">Tune Time</span>
        <span className="pill">Step 1 · Your vibe</span>
      </header>

      <main className="content">
        <h1 className="title">Tell us what you like</h1>
        <p className="subtitle">Search a few songs you love to seed your feed.</p>

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
  const [tab, setTab] = useState<'discover' | 'liked' | 'dating' | 'photos' | 'community'>('discover')
  const [activeIndex, setActiveIndex] = useState(0)
  const [likedSongs, setLikedSongs] = useState<Track[]>([])
  const [dislikedCount, setDislikedCount] = useState(0)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragX, setDragX] = useState(0)
  const [datingDragStartX, setDatingDragStartX] = useState<number | null>(null)
  const [datingDragX, setDatingDragX] = useState(0)
  const [datingLikedUserIds, setDatingLikedUserIds] = useState<string[]>([])
  const [datingPassedUserIds, setDatingPassedUserIds] = useState<string[]>([])
  const [datingMatchedUserIds, setDatingMatchedUserIds] = useState<string[]>([])
  const [datingAgeFilter, setDatingAgeFilter] = useState<DatingAgeFilter>('all')
  const [datingMoodFilters, setDatingMoodFilters] = useState<string[]>([])
  const [photoPosts, setPhotoPosts] = useState<PhotoPost[]>([])
  const [photoThreadError, setPhotoThreadError] = useState<string | null>(null)
  const [photoDraftData, setPhotoDraftData] = useState<string | null>(null)
  const [photoDraftCaption, setPhotoDraftCaption] = useState('')
  const [postingPhoto, setPostingPhoto] = useState(false)
  const [photoActiveIndex, setPhotoActiveIndex] = useState(0)
  const [photoDragStartX, setPhotoDragStartX] = useState<number | null>(null)
  const [photoDragX, setPhotoDragX] = useState(0)
  const [updatingProfilePhoto, setUpdatingProfilePhoto] = useState(false)
  const [socialUsers, setSocialUsers] = useState<SocialUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [socialError, setSocialError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(30)
  const [lyricsByTrack, setLyricsByTrack] = useState<Record<string, TimedLyricLine[]>>({})
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null)
  const photoThreadInputRef = useRef<HTMLInputElement | null>(null)

  const currentTrack = items.length ? items[activeIndex % items.length] : null
  const selectedUser = socialUsers.find((u) => u.id === selectedUserId) || null
  const swipeLabel = dragX > 80 ? 'LIKE' : dragX < -80 ? 'PASS' : null
  const datingSwipeLabel = datingDragX > 80 ? 'LIKE' : datingDragX < -80 ? 'PASS' : null
  const photoSwipeLabel = photoDragX > 80 ? 'NEXT' : photoDragX < -80 ? 'BACK' : null
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
  const remainingDatingCandidates = useMemo(
    () =>
      datingCandidates.filter(
        ({ candidate, candidateMoods }) =>
          !datingLikedUserIds.includes(candidate.id) &&
          !datingPassedUserIds.includes(candidate.id) &&
          matchesDatingAgeFilter(candidate.age, datingAgeFilter) &&
          (datingMoodFilters.length === 0 ||
            datingMoodFilters.some((mood) => candidateMoods.has(mood))),
      ),
    [datingAgeFilter, datingCandidates, datingLikedUserIds, datingMoodFilters, datingPassedUserIds],
  )
  const activeDatingCandidate = remainingDatingCandidates[0] || null
  const activePhotoPost = photoPosts.length ? photoPosts[photoActiveIndex % photoPosts.length] : null

  function toggleDatingMoodFilter(mood: string) {
    setDatingMoodFilters((prev) =>
      prev.includes(mood) ? prev.filter((candidateMood) => candidateMood !== mood) : [...prev, mood],
    )
  }

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
      const data = (await res.json()) as { error?: string; user?: ViewerAccount }
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Could not update profile photo')
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
      setPhotoDraftData(imageData)
      setPhotoThreadError(null)
    } catch {
      setPhotoThreadError('Could not read that photo. Try a different file.')
    }
  }

  async function handleCreatePhotoPost() {
    if (!photoDraftData) {
      setPhotoThreadError('Choose a photo to post.')
      return
    }
    try {
      setPostingPhoto(true)
      setPhotoThreadError(null)
      const res = await fetch(`${API_BASE}/api/social/photo-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(sessionToken) },
        body: JSON.stringify({
          imageData: photoDraftData,
          caption: photoDraftCaption,
        }),
      })
      const data = (await res.json()) as { error?: string; post?: PhotoPost }
      if (!res.ok || !data.post) {
        throw new Error(data.error || 'Could not create photo post')
      }
      setPhotoPosts((prev) => [data.post as PhotoPost, ...prev])
      setPhotoActiveIndex(0)
      setPhotoDraftData(null)
      setPhotoDraftCaption('')
      if (photoThreadInputRef.current) photoThreadInputRef.current.value = ''
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
        const res = await fetch(`${API_BASE}/api/feed`)
        if (!res.ok) throw new Error('Feed failed')
        const data = (await res.json()) as { items: Track[] }
        setItems(data.items)
      } catch {
        setError('Could not load your feed.')
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
        if (data.users.length) {
          setSelectedUserId((prev) => prev || data.users[0].id)
        }
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
        if (!res.ok) throw new Error('Photo feed load failed')
        const data = (await res.json()) as { posts: PhotoPost[] }
        setPhotoPosts(data.posts)
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
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const player = audioRef.current
    const onTimeUpdate = () => setCurrentTime(player.currentTime || 0)
    const onLoadedMeta = () => setDuration(player.duration || 30)
    const onEnded = () => setActiveId(null)
    player.addEventListener('timeupdate', onTimeUpdate)
    player.addEventListener('loadedmetadata', onLoadedMeta)
    player.addEventListener('ended', onEnded)
    return () => {
      player.pause()
      player.removeEventListener('timeupdate', onTimeUpdate)
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

  const activeLyrics = currentTrack ? lyricsByTrack[currentTrack.id] || [] : []
  const currentLyric =
    activeLyrics.find((line) => currentTime >= line.startTime && currentTime < line.endTime)
      ?.text || ''

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
      setCurrentTime(0)
    }
    player.play().catch(() => {})
    setActiveId(track.id)
  }

  async function swipe(action: 'like' | 'dislike') {
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
    } else {
      setDislikedCount((prev) => prev + 1)
    }
    setDragX(0)
    setActiveIndex((prev) => (prev + 1) % items.length)
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
      const data = (await res.json()) as { isFollowing: boolean; isMatched: boolean }
      setSocialUsers((prev) =>
        prev.map((candidate) =>
          candidate.id === user.id
            ? { ...candidate, isFollowing: data.isFollowing, isMatched: data.isMatched }
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
      <header className="top-bar">
        <span className="brand">Tune Time</span>
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
          Community
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
              onPointerDown={(event) => setDragStartX(event.clientX)}
              onPointerMove={(event) => {
                if (dragStartX === null) return
                setDragX(event.clientX - dragStartX)
              }}
              onPointerUp={() => {
                if (dragX > 90) {
                  swipe('like')
                } else if (dragX < -90) {
                  swipe('dislike')
                } else {
                  setDragX(0)
                }
                setDragStartX(null)
              }}
              onPointerCancel={() => {
                setDragStartX(null)
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
              {activeId === currentTrack.id && currentLyric && (
                <p className="lyrics-overlay">{currentLyric}</p>
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
              <button className="like-btn" type="button" onClick={() => swipe('like')}>
                Swipe Right
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
                    <span className="song-artist">{song.artist}</span>
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
            {photoDraftData && <img src={photoDraftData} alt="Post preview" className="photo-post-preview" />}
            <button className="primary-btn" type="button" onClick={handleCreatePhotoPost} disabled={postingPhoto}>
              {postingPhoto ? 'Posting...' : 'Post Photo'}
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
                className="swipe-card"
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
                    stepPhotoThread('back')
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
                <img src={activePhotoPost.imageUrl} alt="" className="card-artwork" />
                <div className="card-overlay-gradient" />
                {photoSwipeLabel && (
                  <div className={`swipe-chip ${photoSwipeLabel === 'NEXT' ? 'swipe-like' : 'swipe-pass'}`}>
                    {photoSwipeLabel}
                  </div>
                )}
                <div className="cover-meta">
                  <p className="song-artist">
                    {activePhotoPost.author ? `${activePhotoPost.author.name} · @${activePhotoPost.author.handle}` : 'Unknown'}
                  </p>
                  <p className="card-artist">{activePhotoPost.caption || 'No caption'}</p>
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
                    messages.map((message) => (
                      <p
                        key={message.id}
                        className={`chat-bubble ${message.fromId === viewer.id ? 'chat-me' : 'chat-them'}`}
                      >
                        {message.text}
                      </p>
                    ))
                  )}
                </div>
                <form className="chat-form" onSubmit={handleSendMessage}>
                  <input
                    className="search-input"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message"
                    disabled={!viewer.matchOpen || !selectedUser.isMatched}
                  />
                  <button
                    className="primary-btn"
                    type="submit"
                    disabled={!viewer.matchOpen || !selectedUser.isMatched}
                  >
                    Send
                  </button>
                </form>
              </section>
            </>
          )}
        </main>
      )}
    </div>
  )
}

export default App
