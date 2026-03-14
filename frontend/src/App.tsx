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
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const VIEWER_STORAGE_KEY = 'tune_time_viewer_id'

function getSurveyStorageKey(userId: string) {
  return `tune_time_survey_complete_${userId}`
}

function App() {
  const [step, setStep] = useState<'account' | 'survey' | 'feed'>('account')
  const [viewer, setViewer] = useState<ViewerAccount | null>(null)
  const [hydrating, setHydrating] = useState(true)

  useEffect(() => {
    async function restoreSession() {
      const storedUserId = window.localStorage.getItem(VIEWER_STORAGE_KEY)
      if (!storedUserId) {
        setHydrating(false)
        return
      }
      try {
        const res = await fetch(
          `${API_BASE}/api/account/profile?userId=${encodeURIComponent(storedUserId)}`,
        )
        const data = (await res.json()) as { user?: ViewerAccount }
        if (!res.ok || !data.user) {
          throw new Error('session not found')
        }
        setViewer(data.user)
        const hasSurvey = window.localStorage.getItem(getSurveyStorageKey(data.user.id)) === '1'
        setStep(hasSurvey ? 'feed' : 'survey')
      } catch {
        window.localStorage.removeItem(VIEWER_STORAGE_KEY)
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
          onAuthSuccess={(user) => {
            window.localStorage.setItem(VIEWER_STORAGE_KEY, user.id)
            setViewer(user)
            const hasSurvey = window.localStorage.getItem(getSurveyStorageKey(user.id)) === '1'
            setStep(hasSurvey ? 'feed' : 'survey')
          }}
        />
      ) : step === 'survey' && viewer ? (
        <SurveyScreen
          viewerId={viewer.id}
          onDone={() => {
            window.localStorage.setItem(getSurveyStorageKey(viewer.id), '1')
            setStep('feed')
          }}
        />
      ) : (
        viewer && (
          <FeedScreen
            viewer={viewer}
            onViewerUpdate={setViewer}
            onSignOut={() => {
              window.localStorage.removeItem(VIEWER_STORAGE_KEY)
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
  onAuthSuccess: (user: ViewerAccount) => void
}

function AccountScreen({ onAuthSuccess }: AccountScreenProps) {
  const [mode, setMode] = useState<'create' | 'signin'>('create')
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [birthday, setBirthday] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [matchOpen, setMatchOpen] = useState(true)
  const [signinHandle, setSigninHandle] = useState('')
  const [signinPassword, setSigninPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !handle.trim() || !birthday || !password) {
      setError('Name, handle, birthday, and password are required.')
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
        }),
      })
      const data = (await res.json()) as { error?: string; user?: ViewerAccount }
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Could not create account')
      }
      onAuthSuccess(data.user)
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
      const data = (await res.json()) as { error?: string; user?: ViewerAccount }
      if (!res.ok || !data.user) {
        throw new Error(data.error || 'Could not sign in')
      }
      onAuthSuccess(data.user)
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
              Birthday is required. Only followers can see your age, never your birthday.
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
  viewerId: string
  onDone: () => void
}

function SurveyScreen({ viewerId, onDone }: SurveyProps) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: viewerId, seeds: selected, moods }),
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
  onViewerUpdate: (next: ViewerAccount) => void
  onSignOut: () => void
}

function FeedScreen({ viewer, onViewerUpdate, onSignOut }: FeedScreenProps) {
  const [items, setItems] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'discover' | 'liked' | 'community'>('discover')
  const [activeIndex, setActiveIndex] = useState(0)
  const [likedSongs, setLikedSongs] = useState<Track[]>([])
  const [dislikedCount, setDislikedCount] = useState(0)
  const [dragStartX, setDragStartX] = useState<number | null>(null)
  const [dragX, setDragX] = useState(0)
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

  const currentTrack = items.length ? items[activeIndex % items.length] : null
  const selectedUser = socialUsers.find((u) => u.id === selectedUserId) || null
  const swipeLabel = dragX > 80 ? 'LIKE' : dragX < -80 ? 'PASS' : null

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
        const res = await fetch(`${API_BASE}/api/social/users?viewerId=${viewer.id}`)
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

    loadFeed()
    loadSocialUsers()
  }, [viewer.id])

  useEffect(() => {
    if (!selectedUserId) return

    async function loadMessages() {
      try {
        const res = await fetch(
          `${API_BASE}/api/social/messages?viewerId=${viewer.id}&withUserId=${selectedUserId}`,
        )
        if (!res.ok) throw new Error('Chat load failed')
        const data = (await res.json()) as { messages: ChatMessage[] }
        setMessages(data.messages)
      } catch {
        setMessages([])
      }
    }

    loadMessages()
  }, [selectedUserId, viewer.id])

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: viewer.id, track: currentTrack }),
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          viewerId: viewer.id,
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromId: viewer.id,
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: viewer.id, matchOpen: nextMatchOpen }),
      })
      if (!res.ok) throw new Error('mode update failed')
      const data = (await res.json()) as { matchOpen: boolean }
      onViewerUpdate({ ...viewer, matchOpen: data.matchOpen })
    } catch {
      setSocialError('Could not update your match mode.')
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

      {tab === 'community' && (
        <main className="community-main">
          {socialError && <p className="error-text">{socialError}</p>}
          <section className="selected-user-card">
            <div>
              <h3>@{viewer.handle}</h3>
              <p className="song-artist">
                Match mode: {viewer.matchOpen ? 'Open (you can match)' : 'Closed (just listening)'}
              </p>
            </div>
            <button
              className={viewer.matchOpen ? 'like-btn' : 'pass-btn'}
              type="button"
              onClick={handleMatchModeToggle}
            >
              {viewer.matchOpen ? 'Set Closed' : 'Set Open'}
            </button>
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
