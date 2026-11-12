import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import logo from './assets/people-constellation-logo.png'
import { contactLabel as ageLabel, daysSince, recencyTone as tone, relationshipLabels } from './domain.ts'
import { api, getIdToken, setIdToken, type RemotePerson } from './services/api.ts'

type Relationship = 'family' | 'friend' | 'coworker' | 'other'
type Person = { id: string; name: string; relationship: Relationship; notes?: string; lastContact?: string; x: number; y: number; createdAt: string; updatedAt: string; version?: number }
type Connection = { id: string; source: string; target: string }
type Activity = { id: string; personId: string; date: string; createdAt?: string; previousLastContact?: string | null }
type Data = { people: Person[]; connections: Connection[]; activities: Activity[] }
const today = new Date()
const now = () => new Date().toISOString()
const emptyData = (): Data => ({ people: [], connections: [], activities: [] })
const labels = relationshipLabels
const pathForView = (view: string) => view === 'Recent connections' ? '/recent' : '/'
const viewForPath = (path: string) => path.startsWith('/people') ? 'All people' : path === '/recent' ? 'Recent connections' : 'My constellation'
const relationshipKeys = ['all', 'family', 'friend', 'coworker', 'other']
const filterForUrl = () => { const routeValue = window.location.pathname.split('/')[2]; const queryValue = new URLSearchParams(window.location.search).get('filter'); const value = relationshipKeys.includes(routeValue) ? routeValue : queryValue; return value && relationshipKeys.includes(value) ? value : 'all' }
const personForUrl = () => new URLSearchParams(window.location.search).get('person')
const fromRemote = (person: RemotePerson): Person => ({ ...person, x: person.position.x, y: person.position.y })
const recencyScore = (date?: string) => Math.exp(-(daysSince(date) ?? 730) / 180)
const starScale = (date?: string) => 0.58 + recencyScore(date) * 0.92
const googleProfile = (token: string): { name?: string; email?: string; picture?: string } => {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(payload), character => character.charCodeAt(0))
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { name?: unknown; email?: unknown; picture?: unknown }
    return { name: typeof claims.name === 'string' ? claims.name : undefined, email: typeof claims.email === 'string' ? claims.email : undefined, picture: typeof claims.picture === 'string' ? claims.picture : undefined }
  } catch { return {} }
}

function App() {
  const [data, setData] = useState<Data>(emptyData)
  const [selected, setSelected] = useState<string | null>(personForUrl())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(filterForUrl)
  const [view, setView] = useState(() => viewForPath(window.location.pathname))
  const [showLines, setShowLines] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [connectMode, setConnectMode] = useState(false)
  const [connectionSource, setConnectionSource] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [account, setAccount] = useState<{ name?: string; email?: string; picture?: string }>({})
  const [authError, setAuthError] = useState('')
  const [syncStatus, setSyncStatus] = useState('Sign in required')
  const [form, setForm] = useState({ name: '', relationship: 'friend' as Relationship, lastContact: '', notes: '' })
  const drag = useRef<{ id: string; pointer: number; startX: number; startY: number; moved: boolean } | null>(null)
  const panDrag = useRef<{ pointer: number; startX: number; startY: number; panX: number; panY: number } | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const googleCallback = useRef<(credential: string) => void>(() => {})
  const signInInProgress = useRef(false)
  const loadedActivityPeople = useRef(new Set<string>())
  const selectedPerson = data.people.find(p => p.id === selected) ?? null
  const navigateView = (next: string, nextFilter = filter) => {
    setView(next)
    setFilter(nextFilter)
    const url = `${pathForView(next)}?filter=${encodeURIComponent(nextFilter)}`
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.pushState({}, '', url)
  }
  useEffect(() => {
    const handleHistory = () => { setView(viewForPath(window.location.pathname)); setFilter(filterForUrl()); setSelected(personForUrl()) }
    window.addEventListener('popstate', handleHistory)
    return () => window.removeEventListener('popstate', handleHistory)
  }, [])
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('filter', filter)
    if (selected) params.set('person', selected)
    const query = params.toString()
    const url = `${pathForView(view)}?${query}`
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState({}, '', url)
  }, [view, filter, selected])
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handleWheelZoom = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = stage.getBoundingClientRect()
      const xRatio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
      const yRatio = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
      const nextZoom = Math.max(0.5, Math.min(2.5, zoom * Math.exp(-event.deltaY * 0.0015)))
      if (nextZoom === zoom) return
      setPan({ x: pan.x + xRatio * (1000 / zoom - 1000 / nextZoom), y: pan.y + yRatio * (700 / zoom - 700 / nextZoom) })
      setZoom(nextZoom)
    }
    stage.addEventListener('wheel', handleWheelZoom, { passive: false })
    return () => stage.removeEventListener('wheel', handleWheelZoom)
  }, [zoom, pan])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) return
    const timer = window.setInterval(() => {
      const button = document.getElementById('google-sign-in-button')
      if (!button || !window.google?.accounts.id || button.childElementCount > 0) return
      window.google.accounts.id.initialize({ client_id: clientId, callback: response => { void googleCallback.current(response.credential) } })
      window.google.accounts.id.renderButton(button, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: 280 })
      window.clearInterval(timer)
    }, 100)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!signedIn || !selected || loadedActivityPeople.current.has(selected)) return
    loadedActivityPeople.current.add(selected)
    void api.activities(selected).then(result => {
      setData(prev => ({ ...prev, activities: [...prev.activities.filter(activity => activity.personId !== selected), ...result.items] }))
    }).catch(error => {
      loadedActivityPeople.current.delete(selected)
      setToast(error instanceof Error ? error.message : 'Could not load recent moments.')
    })
  }, [selected, signedIn])
  const visiblePeople = useMemo(() => data.people.filter(p => (filter === 'all' || p.relationship === filter) && p.name.toLowerCase().includes(query.toLowerCase()) && (view !== 'Recent connections' || (daysSince(p.lastContact) ?? 999) <= 30)), [data.people, filter, query, view])
  const visibleIds = new Set(visiblePeople.map(p => p.id))
  const counts = { total: data.people.length, recent: data.people.filter(p => (daysSince(p.lastContact) ?? 999) <= 7).length, needs: data.people.filter(p => (daysSince(p.lastContact) ?? 0) > 30).length }
  const updatePerson = (id: string, changes: Partial<Person>) => {
    const current = data.people.find(person => person.id === id)
    if (!current) return
    const updated = { ...current, ...changes, updatedAt: now() }
    setData(prev => ({ ...prev, people: prev.people.map(person => person.id === id ? updated : person) }))
    if (signedIn) {
      setSyncStatus('Syncing…')
      void api.updatePerson({ ...updated, position: { x: updated.x, y: updated.y }, version: updated.version ?? current.version ?? 1 }).then(remote => {
        setData(prev => ({ ...prev, people: prev.people.map(person => person.id === id ? fromRemote(remote) : person) }))
        setSyncStatus('Synced')
      }).catch(error => { setSyncStatus('Sync needs attention'); setToast(error instanceof Error ? error.message : 'Could not sync this change.') })
    }
  }
  const signInWithGoogle = useCallback(async (credential: string, showToast = true) => {
    if (signInInProgress.current) return
    signInInProgress.current = true
    setAuthError(''); setSyncStatus('Loading your constellation…'); setIdToken(credential); setAccount(googleProfile(credential))
    try {
      const [peopleResult, connectionsResult] = await Promise.all([api.people(), api.connections()])
      const cloudData: Data = { people: peopleResult.items.map(fromRemote), connections: connectionsResult.items, activities: [] }
      loadedActivityPeople.current.clear()
      setData(cloudData); const requestedPerson = personForUrl(); setSelected(requestedPerson && cloudData.people.some(person => person.id === requestedPerson) ? requestedPerson : null); setSignedIn(true); setSyncStatus('Synced'); if (showToast) setToast('Google account connected')
    } catch (error) {
      setIdToken(null); setAccount({}); setData(emptyData()); setSignedIn(false); setSyncStatus('Sign in required'); setAuthError(error instanceof Error ? error.message : 'Google sign-in could not reach the API.')
    } finally {
      signInInProgress.current = false
    }
  }, [])
  useEffect(() => { googleCallback.current = signInWithGoogle }, [signInWithGoogle])
  useEffect(() => { const token = getIdToken(); if (token) void Promise.resolve().then(() => signInWithGoogle(token, false)) }, [signInWithGoogle])
  const signOut = () => { loadedActivityPeople.current.clear(); setIdToken(null); setAccount({}); setSignedIn(false); setData(emptyData()); setSelected(null); setSyncStatus('Sign in required'); setToast('Signed out') }
  const startAdd = () => { setForm({ name: '', relationship: 'friend', lastContact: '', notes: '' }); setModal('add') }
  const startEdit = () => { if (!selectedPerson) return; setForm({ name: selectedPerson.name, relationship: selectedPerson.relationship, lastContact: selectedPerson.lastContact ?? '', notes: selectedPerson.notes ?? '' }); setModal('edit') }
  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault(); const name = form.name.trim(); if (!name) return
    if (modal === 'edit' && selectedPerson) updatePerson(selectedPerson.id, { ...form, name, lastContact: form.lastContact || undefined })
    else {
      const x = pan.x + 180 / zoom + (data.people.length * 137 % 640) / zoom, y = pan.y + 120 / zoom + (data.people.length * 89 % 390) / zoom
      if (signedIn) {
        try { const person = fromRemote(await api.createPerson({ ...form, name, lastContact: form.lastContact || undefined, position: { x, y } })); setData(prev => ({ ...prev, people: [...prev.people, person] })); setSelected(person.id); setSyncStatus('Synced') }
        catch (error) { setToast(error instanceof Error ? error.message : 'Could not add this person.'); return }
      }
    }
    setModal(null); setToast(modal === 'edit' ? 'Changes saved' : 'Person added to your sky')
  }
  const connectToday = async () => { if (!selectedPerson) return; const date = now().slice(0, 10); try { const result = await api.addActivity(selectedPerson.id, date); setData(prev => ({ ...prev, people: prev.people.map(person => person.id === selectedPerson.id ? { ...person, lastContact: date, version: result.personVersion } : person), activities: [{ ...result, personId: selectedPerson.id, date }, ...prev.activities] })); setSyncStatus('Synced'); setToast('A little moment, remembered') } catch (error) { setToast(error instanceof Error ? error.message : 'Could not record this interaction.') } }
  const undoActivity = async (activity: Activity) => { try { const result = await api.deleteActivity(activity.personId, activity.id); setData(prev => ({ ...prev, people: prev.people.map(person => person.id === activity.personId ? { ...person, lastContact: result.lastContact ?? undefined, version: result.personVersion } : person), activities: prev.activities.filter(item => item.id !== activity.id) })); setSyncStatus('Synced'); setToast('Connection activity undone') } catch (error) { setToast(error instanceof Error ? error.message : 'Could not undo this activity.') } }
  const deletePerson = async () => { if (!selectedPerson) return; const id = selectedPerson.id; try { await api.deletePerson(id); setSyncStatus('Synced'); setData(prev => ({ ...prev, people: prev.people.filter(p => p.id !== id), connections: prev.connections.filter(c => c.source !== id && c.target !== id), activities: prev.activities.filter(a => a.personId !== id) })); setSelected(null); setDeleteConfirmOpen(false); setToast('Person removed') } catch (error) { setDeleteConfirmOpen(false); setToast(error instanceof Error ? error.message : 'Could not delete this person.') } }
  const connectPeople = async (source: string, target: string) => {
    const exists = data.connections.some(c => (c.source === source && c.target === target) || (c.target === source && c.source === target))
    if (exists) { setToast('These stars are already connected'); setConnectMode(false); setConnectionSource(null); return }
    try { const connection = await api.createConnection(source, target); setData(prev => ({ ...prev, connections: [...prev.connections, connection] })); setSyncStatus('Synced'); setToast('Connection made') }
    catch (error) { setToast(error instanceof Error ? error.message : 'Could not connect these people.') }
    setConnectMode(false); setConnectionSource(null)
  }
  const disconnect = async (id: string) => { try { await api.deleteConnection(id); setSyncStatus('Synced'); setData(prev => ({ ...prev, connections: prev.connections.filter(connection => connection.id !== id) })) } catch (error) { setToast(error instanceof Error ? error.message : 'Could not remove this connection.') } }
  const handleStarDown = (e: React.PointerEvent<SVGGElement>, p: Person) => { if (connectMode) { if (!connectionSource) { setConnectionSource(p.id); setToast(`Starting with ${p.name}. Tap another star to connect.`) } else if (connectionSource !== p.id) void connectPeople(connectionSource, p.id); return }
    e.stopPropagation(); drag.current = { id: p.id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false } }
  const handleCanvasDown = (e: React.PointerEvent<SVGSVGElement>) => { if (e.target !== e.currentTarget) return; e.currentTarget.setPointerCapture(e.pointerId); panDrag.current = { pointer: e.pointerId, startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y } }
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => { const box = e.currentTarget.getBoundingClientRect(); const pd = panDrag.current; if (pd?.pointer === e.pointerId) { setPan({ x: pd.panX - (e.clientX - pd.startX) / box.width * 1000 / zoom, y: pd.panY - (e.clientY - pd.startY) / box.height * 700 / zoom }); return } const d = drag.current; if (!d || d.pointer !== e.pointerId) return; if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true; if (!d.moved) return; const vw = 1000 / zoom, vh = 700 / zoom; const x = pan.x + (e.clientX - box.left) / box.width * vw; const y = pan.y + (e.clientY - box.top) / box.height * vh; setData(prev => ({ ...prev, people: prev.people.map(p => p.id === d.id ? { ...p, x, y } : p) })) }
  const endDrag = (e?: React.PointerEvent<SVGSVGElement>) => { if (e && panDrag.current?.pointer === e.pointerId) { panDrag.current = null; return } if (drag.current?.moved) { const p = data.people.find(person => person.id === drag.current?.id); if (p) updatePerson(p.id, { x: p.x, y: p.y }) } drag.current = null }
  const restoringSession = Boolean(getIdToken())
  if (!signedIn) return <main className="signin-gate"><section className="person-modal auth-modal" aria-labelledby="google-title"><div className="brand gate-brand"><span className="brand-mark"><img src={logo} alt="" /></span><span>people<span className="brand-light">constellation</span></span></div><span className="eyebrow">PRIVATE CLOUD CONSTELLATION</span><h1 id="google-title">{restoringSession ? 'Restoring your sky?' : 'Sign in to your sky'}</h1><p className="auth-copy">{restoringSession ? 'Reconnecting to your Google account and loading your constellation.' : 'Sign in with Google to create and manage your private constellation across your devices.'}</p>{!restoringSession && <div id="google-sign-in-button" className="google-button-slot" />}{!restoringSession && (authError || (!import.meta.env.VITE_GOOGLE_CLIENT_ID && 'Set VITE_GOOGLE_CLIENT_ID in .env.local first.')) && <p className="auth-error" role="alert">{authError || 'Set VITE_GOOGLE_CLIENT_ID in .env.local first.'}</p>}<p className="auth-footnote">Your people and connections are saved to your account.</p></section></main>
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><img src={logo} alt="" /></span><span>people<span className="brand-light">constellation</span></span></div>
      <div className="workspace-label">YOUR UNIVERSE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {[['✧', 'My constellation'], ['◷', 'Recent connections']].map(([icon, name]) => <button key={name} className={`nav-item ${view === name || (name === 'My constellation' && view === 'All people') ? 'active' : ''}`} onClick={() => { navigateView(name, 'all') }}><span className="nav-icon">{icon}</span>{name}{name === 'All people' && <span className="nav-count">{data.people.length}</span>}</button>)}
      </nav>
      <div className="sidebar-rule" />
      <div className="workspace-label">RELATIONSHIPS</div>
      <div className="relationship-list"><button onClick={() => navigateView('All people', 'all')} className={`relationship-filter ${filter === 'all' ? 'chosen' : ''}`}><i className="tiny-dot all" />All<span>{data.people.length}</span></button>{Object.entries(labels).map(([key, label]) => <button key={key} onClick={() => { navigateView('All people', key) }} className={`relationship-filter ${filter === key ? 'chosen' : ''}`}><i className={`tiny-dot ${key}`} />{label}<span>{data.people.filter(p => p.relationship === key).length}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="profile">{account.picture ? <img className="avatar account-avatar" src={account.picture} alt="" referrerPolicy="no-referrer" /> : <div className="avatar">{(account.name ?? account.email ?? 'G').charAt(0).toUpperCase()}</div>}<div className="profile-text"><strong>{account.name ?? account.email ?? 'Google account'}</strong><small>{account.email ?? 'Cloud constellation'}</small></div><button className="more-button" aria-label="Sign out" title="Sign out" onClick={signOut}>↪</button></div></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">Your space <span>/</span> <strong>{view === 'All people' ? 'My constellation' : view}</strong></div><div className="top-actions"><span className="saved-indicator"><i />{syncStatus}</span><button className="edit-button" onClick={signOut}>Sign out</button></div></header>
      <div className="page-content">
        <section className="welcome-row"><div><h1>{view === 'Recent connections' ? 'Recent connections' : view === 'All people' ? 'Everyone in your constellation' : 'A sky full of your people'}</h1><p className="subhead">Every connection has its own place in your universe.</p></div><button className="primary-button" onClick={startAdd}><span>＋</span> Add a person</button></section>
        <section className="sky-panel">
          <div className="sky-toolbar"><div className="sky-title"><span className="live-dot" />YOUR CONSTELLATION</div><div className="toolbar-actions"><label className="search-box"><span>⌕</span><input aria-label="Search people" placeholder="Find someone..." value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><button className={`tool-button ${showLines ? 'tool-active' : ''}`} title="Toggle connection lines" onClick={() => setShowLines(!showLines)}>⌁</button><button className={`tool-button ${connectMode ? 'tool-active' : ''}`} title="Connect two stars" onClick={() => { const next = !connectMode; setConnectMode(next); setConnectionSource(null); if (next) setSelected(null) }}>⟷</button><button className="tool-button zoom-icon" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(0.5, +(value - 0.25).toFixed(2)))}><span aria-hidden="true">−</span></button><span className="zoom-level" aria-live="polite">{Math.round(zoom * 100)}%</span><button className="tool-button zoom-icon" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(2.5, +(value + 0.25).toFixed(2)))}><span aria-hidden="true">+</span></button><button className="tool-button reset-zoom" title="Reset canvas view" aria-label="Reset canvas view" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}><span aria-hidden="true">↺</span></button></div></div>
          <div ref={stageRef} className={`sky-stage ${connectMode ? 'connect-mode' : ''}`}>
            <div className="sky-grid" /><div className="sky-glow glow-one" /><div className="sky-glow glow-two" /><div className="sky-glow glow-three" />
            <div className="stage-caption"><span>✧</span> {connectMode ? 'Choose another star to connect' : 'DRAG STARS TO FIND THEIR PLACE'} <span className="caption-sep">·</span> {visiblePeople.length} STARS</div>
            {visiblePeople.length === 0 && <div className="empty-sky"><div>?</div><strong>{data.people.length === 0 ? 'Your universe is waiting' : 'No people match these filters'}</strong><span>{data.people.length === 0 ? 'Add someone to see their star appear here.' : 'Try another relationship, or clear your search and filters.'}</span>{data.people.length === 0 ? <button className="primary-button" onClick={startAdd}>? Add your first person</button> : <button className="primary-button" onClick={() => { setQuery(''); navigateView('All people', 'all') }}>Show everyone</button>}</div>}
            <svg className="constellation-svg" viewBox={`${pan.x} ${pan.y} ${1000 / zoom} ${700 / zoom}`} preserveAspectRatio="xMidYMid meet" aria-label="Interactive constellation of people. Drag empty space to pan." onPointerDown={handleCanvasDown} onPointerMove={handleMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={() => { if (!connectMode) setSelected(null) }}>
              <g className="connections">{showLines && data.connections.filter(c => visibleIds.has(c.source) && visibleIds.has(c.target)).map(c => { const a = data.people.find(p => p.id === c.source), b = data.people.find(p => p.id === c.target); return a && b ? <line key={c.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={selected === a.id || selected === b.id ? 'connection focused' : 'connection'} /> : null })}</g>
              {visiblePeople.map(p => { const t = tone(p.lastContact); const isSelected = selected === p.id || connectionSource === p.id; const size = starScale(p.lastContact); const brightness = recencyScore(p.lastContact); return <g key={p.id} className={`star-node relationship-${p.relationship} recency-${t} ${isSelected ? 'selected' : ''}`} transform={`translate(${p.x} ${p.y})`} onPointerDown={e => handleStarDown(e, p)} onClick={e => { e.stopPropagation(); if (!connectMode) setSelected(p.id) }} role="button" aria-label={`${p.name}, ${labels[p.relationship]}, ${ageLabel(p.lastContact)}`} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.id) } }}>
                <g transform={`scale(${size})`}><circle className="star-halo" r="34" style={{ opacity: 0.025 + brightness * 0.15 }} /><circle className="star-orbit" r="24" style={{ opacity: 0.1 + brightness * 0.22 }} /><circle className="star-core" r={isSelected ? 8 : 6} style={{ opacity: 0.4 + brightness * 0.6, filter: `drop-shadow(0 0 ${3 + brightness * 7}px currentColor)` }} /><path className="star-cross" d="M0 -17 L0 17 M-17 0 L17 0" style={{ opacity: 0.3 + brightness * 0.42 }} /></g><circle className="star-hit" r="40" /><text className="star-name" x="0" y={47 * size} textAnchor="middle" fontSize={12 / size}>{p.name.split(' ')[0]}</text>
              </g> })}
            </svg>
            <div className="map-legend"><span className="legend-explanation">Star brightness shows how recently you connected.</span></div>
            <div className="stage-controls"><button onClick={() => setToast('Drag the stars to arrange your sky')} title="Help">?</button><button onClick={() => setShowLines(!showLines)} title="Toggle connections">⌁</button></div>
          </div>
          <div className="sky-footer"><span><span className="grab-hint">⠿</span> Click and drag to rearrange your constellation</span><span>YOUR SPACE IS PRIVATE <span className="lock">⌑</span></span></div>
        </section>
        <div className="overview-wrap"><div className="overview-heading">Overview</div><section className="overview-strip"><div className="overview-item"><div className="overview-icon purple-icon">✧</div><div><span>IN YOUR UNIVERSE</span><strong>{counts.total} <small>people</small></strong></div></div><div className="overview-divider" /><div className="overview-item"><div className="overview-icon gold-icon">✦</div><div><span>CONNECTED THIS WEEK</span><strong>{counts.recent} <small>people</small></strong></div></div><div className="overview-divider" /><div className="overview-item"><div className="overview-icon blue-icon">◷</div><div><span>TIME TO RECONNECT</span><strong>{counts.needs} <small>people</small></strong></div></div><div className="overview-note">A gentle reminder to reach out<br />can make someone's day.</div></section></div>
        <section className="bottom-row"><div className="bottom-heading"><div><span className="eyebrow">{view === 'All people' ? 'YOUR CONSTELLATION' : 'A LITTLE NUDGE'}</span><h2>{view === 'All people' ? `All ${data.people.length} people` : 'Someone on your mind?'}</h2></div>{view !== 'All people' && <button className="text-button" onClick={() => navigateView('All people', 'all')}>See everyone <span>→</span></button>}</div><div className="nudge-list">{(view === 'All people' ? data.people : data.people.filter(p => (daysSince(p.lastContact) ?? 999) > 30).slice(0, 3)).map(p => <button className="nudge" key={p.id} onClick={() => setSelected(p.id)}><span className={`nudge-star relationship-${p.relationship} recency-${tone(p.lastContact)}`} style={{ transform: `scale(${starScale(p.lastContact)})`, opacity: 0.4 + recencyScore(p.lastContact) * 0.6, textShadow: `0 0 ${3 + recencyScore(p.lastContact) * 7}px currentColor` }} aria-hidden="true">✦</span><span className="nudge-person"><strong>{p.name}</strong><small>{labels[p.relationship]}</small></span><span className="nudge-when">{ageLabel(p.lastContact)}</span><span className="nudge-arrow">→</span></button>)}{view !== 'All people' && counts.needs === 0 && <p className="all-caught-up">Everyone is feeling close. Keep nurturing those connections. ✧</p>}{view === 'All people' && data.people.length === 0 && <p className="all-caught-up">Your constellation is empty. Add your first person to get started.</p>}</div></section>
      </div>
    </section>
    <aside className={`details-panel ${selectedPerson ? 'details-open' : ''}`}>
      {selectedPerson ? <><div className="details-top"><span>PERSONAL ORBIT</span><button className="close-details" aria-label="Close details" onClick={() => setSelected(null)}>×</button></div><div className={`detail-star relationship-${selectedPerson.relationship} recency-${tone(selectedPerson.lastContact)}`} style={{ transform: `scale(${starScale(selectedPerson.lastContact)})`, opacity: 0.4 + recencyScore(selectedPerson.lastContact) * 0.6, boxShadow: `0 0 ${10 + recencyScore(selectedPerson.lastContact) * 20}px currentColor` }}><span>✦</span></div><h2 className="person-name">{selectedPerson.name}</h2><div className="person-category"><span className={`category-dot ${selectedPerson.relationship}`} />{labels[selectedPerson.relationship]}</div><div className="last-contact"><span className="contact-icon">◷</span><div><small>LAST CONNECTED</small><strong>{ageLabel(selectedPerson.lastContact)}</strong><span>{selectedPerson.lastContact ? new Date(`${selectedPerson.lastContact}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'No date recorded'}</span></div></div><div className="detail-section"><div className="detail-section-label">A NOTE TO YOURSELF <button onClick={startEdit} aria-label="Edit note">✎</button></div><p className="notes-text">{selectedPerson.notes || <span className="muted">No notes yet. Add a little reminder.</span>}</p></div><div className="detail-section orbit-section"><div className="detail-section-label">CONNECTED STARS <span>{data.connections.filter(c => c.source === selectedPerson.id || c.target === selectedPerson.id).length}</span></div>{data.connections.filter(c => c.source === selectedPerson.id || c.target === selectedPerson.id).slice(0, 4).map(c => { const other = data.people.find(p => p.id === (c.source === selectedPerson.id ? c.target : c.source)); return other ? <div className="orbit-person" key={c.id}><span className={`orbit-dot relationship-${other.relationship}` } />{other.name}<button onClick={() => void disconnect(c.id)} aria-label={`Disconnect ${other.name}`}>×</button></div> : null })}{data.connections.filter(c => c.source === selectedPerson.id || c.target === selectedPerson.id).length === 0 && <p className="muted small-muted">No connected stars yet.</p>}<button className="connect-link" onClick={() => { setConnectMode(true); setConnectionSource(null); setSelected(null); setToast('Choose two stars to connect') }}>＋ Connect to a person</button></div><div className="activity-section"><div className="detail-section-label">RECENT MOMENTS</div>{data.activities.filter(a => a.personId === selectedPerson.id).sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date)).slice(0, 3).map((a, index) => <div className="activity-row" key={a.id}><i />Connected on {new Date(`${a.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{index === 0 && <button className="undo-activity" onClick={() => void undoActivity(a)} aria-label={`Undo connection on ${a.date}`}>Undo</button>}</div>)}{!data.activities.some(a => a.personId === selectedPerson.id) && <p className="muted small-muted">Your moments together will live here.</p>}</div><div className="detail-actions"><button className="connected-button" onClick={() => void connectToday()}><span>✦</span> Connected today</button><div><button className="edit-button" onClick={startEdit}>Edit person</button><button className="delete-button" onClick={() => setDeleteConfirmOpen(true)}>Delete</button></div></div></> : <div className="detail-empty"><div>✧</div><strong>Your people, up close</strong><p>Select a star to see their details, add a note, or record a moment together.</p></div>}
    </aside>
    {deleteConfirmOpen && selectedPerson && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDeleteConfirmOpen(false) }}><section className="person-modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description"><div className="modal-top"><div><span className="eyebrow">YOUR UNIVERSE</span><h2 id="delete-title">Remove this person?</h2></div><button type="button" className="close-details" aria-label="Close dialog" onClick={() => setDeleteConfirmOpen(false)}>×</button></div><p id="delete-description">Remove <strong>{selectedPerson.name}</strong> and their connections from your constellation?</p><div className="modal-actions"><button type="button" className="edit-button" onClick={() => setDeleteConfirmOpen(false)}>Keep person</button><button type="button" className="primary-button danger-button" onClick={() => void deletePerson()}>Remove person</button></div></section></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}><form className="person-modal" onSubmit={saveForm} aria-labelledby="modal-title"><div className="modal-top"><div><span className="eyebrow">YOUR UNIVERSE</span><h2 id="modal-title">{modal === 'add' ? 'Add someone special' : 'Edit person'}</h2></div><button type="button" className="close-details" aria-label="Close dialog" onClick={() => setModal(null)}>×</button></div><label>Name<input autoFocus required maxLength={80} placeholder="Their name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Relationship<select value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value as Relationship })}>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Last connected<input type="date" max={today.toISOString().slice(0, 10)} value={form.lastContact} onChange={e => setForm({ ...form, lastContact: e.target.value })} /></label><label>A note to yourself<textarea rows={3} maxLength={1000} placeholder="A favorite memory, something to ask about..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><div className="modal-actions"><button type="button" className="edit-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" type="submit">{modal === 'add' ? 'Add to my sky' : 'Save changes'}</button></div></form></div>}
    {toast && <div className="toast" role="status"><span>✦</span>{toast}</div>}
  </main>
}
export default App











