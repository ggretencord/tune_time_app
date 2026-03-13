import { useEffect, useRef, useState } from 'react'
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

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function App() {
  const [step, setStep] = useState<'survey' | 'feed'>('survey')

  return (
    <div className="app-root">
      {step === 'survey' ? (
        <SurveyScreen onDone={() => setStep('feed')} />
      ) : (
        <FeedScreen />
      )}
    </div>
  )
}

type SurveyProps = {
  onDone: () => void
}

function SurveyScreen({ onDone }: SurveyProps) {
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
    } catch (err) {
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
        body: JSON.stringify({ seeds: selected, moods }),
      })
      if (!res.ok) {
        throw new Error('Survey submit failed')
      }
      onDone()
    } catch (err) {
      setError('Could not save your preferences. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const MOOD_OPTIONS = ['chill', 'hype', 'sad', 'focus', 'party', 'romantic']

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
            {loading ? 'Searching…' : 'Search'}
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
                  {t.artworkUrl && (
                    <img src={t.artworkUrl} alt="" className="result-artwork" />
                  )}
                  <div className="result-meta">
                    <span className="song-title">{t.title}</span>
                    <span className="song-artist">
                      {t.artist}
                      {t.album ? ` • ${t.album}` : ''}
                    </span>
                  </div>
                  <span className="result-badge">
                    {isSelected ? 'Added' : 'Add'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <section className="moods">
          <h2 className="section-title">Pick a mood (optional)</h2>
          <div className="chips-row">
            {MOOD_OPTIONS.map((mood) => (
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
          {submitting ? 'Tuning your feed…' : 'Start your feed'}
        </button>
      </footer>
    </div>
  )
}

function FeedScreen() {
  const [items, setItems] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    async function loadFeed() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/api/feed`)
        if (!res.ok) throw new Error('Feed failed')
        const data = (await res.json()) as { items: Track[] }
        setItems(data.items)
      } catch (err) {
        setError('Could not load your feed.')
      } finally {
        setLoading(false)
      }
    }
    loadFeed()
  }, [])

  function handlePlay(track: Track) {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    const player = audioRef.current
    if (activeId === track.id && !player.paused) {
      player.pause()
      setActiveId(null)
      return
    }
    player.src = track.previewUrl
    player.currentTime = 0
    player.play().catch(() => {})
    setActiveId(track.id)
  }

  if (loading) {
    return (
      <div className="screen feed-screen">
        <div className="loading-state">Loading your mix…</div>
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
        <span className="pill">For you</span>
      </header>

      <main className="feed">
        {items.map((t) => (
          <section key={t.id} className="card">
            <div className="card-media">
              {t.artworkUrl && (
                <img src={t.artworkUrl} alt="" className="card-artwork" />
              )}
              <div className="card-overlay-gradient" />
              <button
                className="play-btn"
                type="button"
                onClick={() => handlePlay(t)}
              >
                {activeId === t.id ? 'Pause' : 'Play'}
              </button>
            </div>
            <div className="card-meta">
              <h2 className="card-title">{t.title}</h2>
              <p className="card-artist">
                {t.artist}
                {t.genre ? ` • ${t.genre}` : ''}
              </p>
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}

export default App
