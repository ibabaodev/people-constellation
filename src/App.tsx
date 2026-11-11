import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { contactLabel as ageLabel, daysSince, recencyTone as tone, relationshipLabels } from './domain.ts'
import { api, setIdToken, type RemotePerson } from './services/api.ts'

type Relationship = 'family' | 'friend' | 'coworker' | 'other'
type Person = { id: string; name: string; relationship: Relationship; notes?: string; lastContact?: string; x: number; y: number; createdAt: string; updatedAt: string; version?: number }
type Connection = { id: string; source: string; target: string }
type Activity = { id: string; personId: string; date: string }
type Data = { people: Person[]; connections: Connection[]; activities: Activity[] }
const KEY = 'people-constellation-demo-v1'
const today = new Date()
const daysAgo = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10) }
const now = () => new Date().toISOString()
const seed: Data = {
  people: [
    { id: 'alex', name: 'Alex Morgan', relationship: 'friend', lastContact: daysAgo(0), x: 500, y: 350, createdAt: now(), updatedAt: now(), notes: 'Always knows the best little coffee spots.' },
    { id: 'mia', name: 'Mia Chen', relationship: 'family', lastContact: daysAgo(5), x: 320, y: 235, createdAt: now(), updatedAt: now(), notes: 'Call about the weekend plans.' },
    { id: 'jordan', name: 'Jordan Lee', relationship: 'coworker', lastContact: daysAgo(14), x: 690, y: 225, createdAt: now(), updatedAt: now(), notes: 'Shared a thoughtful book recommendation.' },
    { id: 'sam', name: 'Sam Rivera', relationship: 'friend', lastContact: daysAgo(45), x: 735, y: 455, createdAt: now(), updatedAt: now(), notes: 'We should plan a hike.' },
    { id: 'taylor', name: 'Taylor Brooks', relationship: 'friend', lastContact: daysAgo(120), x: 300, y: 485, createdAt: now(), updatedAt: now(), notes: '' },
    { id: 'casey', name: 'Casey Park', relationship: 'family', lastContact: daysAgo(200), x: 510, y: 135, createdAt: now(), updatedAt: now(), notes: 'Send the family photos.' },
  ],
  connections: [ { id: 'c1', source: 'alex', target: 'mia' }, { id: 'c2', source: 'alex', target: 'jordan' }, { id: 'c3', source: 'alex', target: 'sam' }, { id: 'c4', source: 'alex', target: 'taylor' }, { id: 'c5', source: 'mia', target: 'casey' } ],
  activities: [],
}
const readData = (): Data => { try { const stored = localStorage.getItem(KEY); return stored ? JSON.parse(stored) as Data : seed } catch { return seed } }
const labels = relationshipLabels
const fromRemote = (person: RemotePerson): Person => ({ ...person, x: person.position.x, y: person.position.y })

function App() {
  const [data, setData] = useState<Data>(readData)
  const [selected, setSelected] = useState<string | null>('alex')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('My constellation')
  const [showLines, setShowLines] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [toast, setToast] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authError, setAuthError] = useState('')
  const [syncStatus, setSyncStatus] = useState('Saved locally')
  const [form, setForm] = useState({ name: '', relationship: 'friend' as Relationship, lastContact: '', notes: '' })
  const drag = useRef<{ id: string; pointer: number; startX: number; startY: number; moved: boolean } | null>(null)
  const googleCallback = useRef<(credential: string) => void>(() => {})
  const selectedPerson = data.people.find(p => p.id === selected) ?? null
  useEffect(() => { if (!signedIn) localStorage.setItem(KEY, JSON.stringify(data)) }, [data, signedIn])
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 2600); return () => window.clearTimeout(t) }, [toast])
  useEffect(() => {
    if (!authOpen) return
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) return
    const button = document.getElementById('google-sign-in-button')
    const timer = window.setInterval(() => {
      if (!button || !window.google?.accounts.id || button.childElementCount > 0) return
      window.google.accounts.id.initialize({ client_id: clientId, callback: response => { void googleCallback.current(response.credential) } })
      window.google.accounts.id.renderButton(button, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width: 280 })
      window.clearInterval(timer)
    }, 100)
    return () => window.clearInterval(timer)
  }, [authOpen])
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
  const signInWithGoogle = useCallback(async (credential: string) => {
    setAuthError(''); setSyncStatus('Loading your constellation…'); setIdToken(credential)
    try {
      const [peopleResult, connectionsResult] = await Promise.all([api.people(), api.connections()])
      const activities = await Promise.all(peopleResult.items.map(person => api.activities(person.id)))
      const cloudData: Data = { people: peopleResult.items.map(fromRemote), connections: connectionsResult.items, activities: activities.flatMap(result => result.items) }
      setData(cloudData); setSelected(cloudData.people[0]?.id ?? null); setSignedIn(true); setAuthOpen(false); setSyncStatus('Synced'); setToast('Google account connected')
    } catch (error) {
      setIdToken(null); setSyncStatus('Saved locally'); setAuthError(error instanceof Error ? error.message : 'Google sign-in could not reach the API.')
    }
  }, [])
  useEffect(() => { googleCallback.current = signInWithGoogle }, [signInWithGoogle])
  const signOut = () => { setIdToken(null); setSignedIn(false); setData(readData()); setSelected('alex'); setAuthOpen(false); setSyncStatus('Saved locally'); setToast('Signed out. Your local demo is unchanged.') }
  const startAdd = () => { setForm({ name: '', relationship: 'friend', lastContact: '', notes: '' }); setModal('add') }
  const startEdit = () => { if (!selectedPerson) return; setForm({ name: selectedPerson.name, relationship: selectedPerson.relationship, lastContact: selectedPerson.lastContact ?? '', notes: selectedPerson.notes ?? '' }); setModal('edit') }
  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault(); const name = form.name.trim(); if (!name) return
    if (modal === 'edit' && selectedPerson) updatePerson(selectedPerson.id, { ...form, name, lastContact: form.lastContact || undefined })
    else {
      const x = 180 + (data.people.length * 137 % 640), y = 120 + (data.people.length * 89 % 390)
      if (signedIn) {
        try { const person = fromRemote(await api.createPerson({ ...form, name, lastContact: form.lastContact || undefined, position: { x, y } })); setData(prev => ({ ...prev, people: [...prev.people, person] })); setSelected(person.id); setSyncStatus('Synced') }
        catch (error) { setToast(error instanceof Error ? error.message : 'Could not add this person.'); return }
      } else { const person: Person = { id: crypto.randomUUID(), ...form, name, lastContact: form.lastContact || undefined, x, y, createdAt: now(), updatedAt: now() }; setData(prev => ({ ...prev, people: [...prev.people, person] })); setSelected(person.id) }
    }
    setModal(null); setToast(modal === 'edit' ? 'Changes saved' : 'Person added to your sky')
  }
  const connectToday = async () => { if (!selectedPerson) return; const date = now().slice(0, 10); let activityId: string = crypto.randomUUID(); let version = selectedPerson.version; if (signedIn) { try { const result = await api.addActivity(selectedPerson.id, date); activityId = result.id; version = result.personVersion; setSyncStatus('Synced') } catch (error) { setToast(error instanceof Error ? error.message : 'Could not record this interaction.'); return } } if (signedIn) setData(prev => ({ ...prev, people: prev.people.map(person => person.id === selectedPerson.id ? { ...person, lastContact: date, version } : person), activities: [{ id: activityId, personId: selectedPerson.id, date }, ...prev.activities] })); else { updatePerson(selectedPerson.id, { lastContact: date }); setData(prev => ({ ...prev, activities: [{ id: activityId, personId: selectedPerson.id, date }, ...prev.activities] })) } setToast('A little moment, remembered') }
  const deletePerson = async () => { if (!selectedPerson || !window.confirm(`Remove ${selectedPerson.name} from your constellation?`)) return; const id = selectedPerson.id; if (signedIn) { try { await api.deletePerson(id); setSyncStatus('Synced') } catch (error) { setToast(error instanceof Error ? error.message : 'Could not delete this person.'); return } } setData(prev => ({ ...prev, people: prev.people.filter(p => p.id !== id), connections: prev.connections.filter(c => c.source !== id && c.target !== id), activities: prev.activities.filter(a => a.personId !== id) })); setSelected(null); setToast('Person removed') }
  const connectPeople = async (source: string, target: string) => {
    const exists = data.connections.some(c => (c.source === source && c.target === target) || (c.target === source && c.source === target))
    if (exists) { setToast('These stars are already connected'); setConnectMode(false); return }
    try { const connection = signedIn ? await api.createConnection(source, target) : { id: crypto.randomUUID(), source, target }; setData(prev => ({ ...prev, connections: [...prev.connections, connection] })); if (signedIn) setSyncStatus('Synced'); setToast('Connection made') }
    catch (error) { setToast(error instanceof Error ? error.message : 'Could not connect these people.') }
    setConnectMode(false)
  }
  const disconnect = async (id: string) => { if (signedIn) { try { await api.deleteConnection(id); setSyncStatus('Synced') } catch (error) { setToast(error instanceof Error ? error.message : 'Could not remove this connection.'); return } } setData(prev => ({ ...prev, connections: prev.connections.filter(connection => connection.id !== id) })) }
  const handleStarDown = (e: React.PointerEvent<SVGGElement>, p: Person) => { if (connectMode) { if (!selected) setSelected(p.id); else if (selected !== p.id) void connectPeople(selected, p.id); return }
    e.stopPropagation(); (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId); drag.current = { id: p.id, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false }; setSelected(p.id) }
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => { const d = drag.current; if (!d || d.pointer !== e.pointerId) return; if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true; if (!d.moved) return; const box = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - box.left) / box.width * 1000; const y = (e.clientY - box.top) / box.height * 700; setData(prev => ({ ...prev, people: prev.people.map(p => p.id === d.id ? { ...p, x, y } : p) })) }
  const endDrag = () => { if (drag.current?.moved) { const p = data.people.find(person => person.id === drag.current?.id); if (p) updatePerson(p.id, { x: p.x, y: p.y }) } drag.current = null }
  const clearDemo = () => { if (!window.confirm('Clear the sample constellation and start with an empty sky?')) return; setData({ people: [], connections: [], activities: [] }); setSelected(null); setToast('Your sky is ready for its first star') }
  const restoreDemo = () => { if (signedIn) { setToast('Sign out to open the local demo.'); return } setData(seed); setSelected('alex'); setToast('Sample constellation restored') }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><span>✦</span></span><span>people<span className="brand-light">constellation</span></span></div>
      <div className="workspace-label">YOUR UNIVERSE</div>
      <nav className="nav-list" aria-label="Main navigation">
        {[['✧', 'My constellation'], ['☼', 'All people'], ['◷', 'Recent connections']].map(([icon, name]) => <button key={name} className={`nav-item ${view === name ? 'active' : ''}`} onClick={() => { setView(name); if (name !== 'Recent connections') setFilter('all') }}><span className="nav-icon">{icon}</span>{name}{name === 'All people' && <span className="nav-count">{data.people.length}</span>}</button>)}
      </nav>
      <div className="sidebar-rule" />
      <div className="workspace-label">RELATIONSHIPS</div>
      <div className="relationship-list">{Object.entries(labels).map(([key, label]) => <button key={key} onClick={() => { setFilter(filter === key ? 'all' : key); setView('All people') }} className={`relationship-filter ${filter === key ? 'chosen' : ''}`}><i className={`tiny-dot ${key}`} />{label}<span>{data.people.filter(p => p.relationship === key).length}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="sync-row"><span className="online-dot" />{signedIn ? 'Google account · cloud data' : 'Saved on this device'}</div><div className="profile"><div className="avatar">{signedIn ? 'G' : 'Y'}</div><div className="profile-text"><strong>{signedIn ? 'Google account' : 'Your private sky'}</strong><small>{signedIn ? 'Cloud constellation' : 'Demo mode'}</small></div><button className="more-button" aria-label={signedIn ? 'Sign out' : 'Restore sample data'} onClick={signedIn ? signOut : restoreDemo}>{signedIn ? '↪' : '···'}</button></div>{!signedIn && <button className="clear-demo" onClick={clearDemo}>Clear sample people</button>}</div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div className="breadcrumb">Your space <span>/</span> <strong>{view}</strong></div><div className="top-actions"><span className="saved-indicator"><i />{syncStatus}</span>{signedIn ? <button className="edit-button" onClick={signOut}>Sign out</button> : <button className="google-open-button" onClick={() => { setAuthError(import.meta.env.VITE_GOOGLE_CLIENT_ID ? '' : 'Set VITE_GOOGLE_CLIENT_ID in .env.local first.'); setAuthOpen(true) }}>Sign in with Google</button>}</div></header>
      <div className="page-content">
        <section className="welcome-row"><div><div className="eyebrow"><span>✦</span> YOUR PERSONAL UNIVERSE</div><h1>{view === 'Recent connections' ? 'Recent connections' : 'A sky full of your people'}</h1><p className="subhead">Every connection has its own place in your universe.</p></div><button className="primary-button" onClick={startAdd}><span>＋</span> Add a person</button></section>
        <section className="overview-strip"><div className="overview-item"><div className="overview-icon purple-icon">✧</div><div><span>IN YOUR UNIVERSE</span><strong>{counts.total} <small>people</small></strong></div></div><div className="overview-divider" /><div className="overview-item"><div className="overview-icon gold-icon">✦</div><div><span>CONNECTED THIS WEEK</span><strong>{counts.recent} <small>people</small></strong></div></div><div className="overview-divider" /><div className="overview-item"><div className="overview-icon blue-icon">◷</div><div><span>TIME TO RECONNECT</span><strong>{counts.needs} <small>people</small></strong></div></div><div className="overview-note">A gentle reminder to reach out<br />can make someone's day.</div></section>
        <section className="sky-panel">
          <div className="sky-toolbar"><div className="sky-title"><span className="live-dot" />YOUR CONSTELLATION <span className="mini-pill">DEMO</span></div><div className="toolbar-actions"><label className="search-box"><span>⌕</span><input aria-label="Search people" placeholder="Find someone..." value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><button className={`tool-button ${showLines ? 'tool-active' : ''}`} title="Toggle connection lines" onClick={() => setShowLines(!showLines)}>⌁</button><button className={`tool-button ${connectMode ? 'tool-active' : ''}`} title="Connect two stars" onClick={() => { setConnectMode(!connectMode); setSelected(selected ?? visiblePeople[0]?.id ?? null) }}>⟷</button><button className="tool-button" title="Reset sample constellation" onClick={restoreDemo}>⟳</button></div></div>
          <div className={`sky-stage ${connectMode ? 'connect-mode' : ''}`}>
            <div className="sky-grid" /><div className="sky-glow glow-one" /><div className="sky-glow glow-two" /><div className="sky-glow glow-three" />
            <div className="stage-caption"><span>✧</span> {connectMode ? 'Choose another star to connect' : 'DRAG STARS TO FIND THEIR PLACE'} <span className="caption-sep">·</span> {visiblePeople.length} STARS</div>
            {visiblePeople.length === 0 && <div className="empty-sky"><div>✧</div><strong>Your universe is waiting</strong><span>Add someone to see their star appear here.</span><button className="primary-button" onClick={startAdd}>＋ Add your first person</button></div>}
            <svg className="constellation-svg" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-label="Interactive constellation of people" onPointerMove={handleMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={() => { if (!connectMode) setSelected(null) }}>
              <g className="connections">{showLines && data.connections.filter(c => visibleIds.has(c.source) && visibleIds.has(c.target)).map(c => { const a = data.people.find(p => p.id === c.source), b = data.people.find(p => p.id === c.target); return a && b ? <line key={c.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={selected === a.id || selected === b.id ? 'connection focused' : 'connection'} /> : null })}</g>
              {visiblePeople.map((p, i) => { const t = tone(p.lastContact); const isSelected = selected === p.id; return <g key={p.id} className={`star-node tone-${t} ${isSelected ? 'selected' : ''}`} transform={`translate(${p.x} ${p.y})`} onPointerDown={e => handleStarDown(e, p)} onClick={e => { e.stopPropagation(); if (!connectMode) setSelected(p.id) }} role="button" aria-label={`${p.name}, ${labels[p.relationship]}, ${ageLabel(p.lastContact)}`} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.id) } }}>
                <circle className="star-halo" r={34 + (i % 3) * 5} /><circle className="star-orbit" r="24" /><circle className="star-core" r={isSelected ? 8 : 6} /><path className="star-cross" d="M0 -17 L0 17 M-17 0 L17 0" /><circle className="star-hit" r="40" /><text className="star-name" x="0" y="47" textAnchor="middle">{p.name.split(' ')[0]}</text>
              </g> })}
            </svg>
            <div className="map-legend"><span><i className="legend-dot gold" />Just connected</span><span><i className="legend-dot blue" />Recently</span><span><i className="legend-dot violet" />A little while</span><span><i className="legend-dot dim" />Longer ago</span></div>
            <div className="stage-controls"><button onClick={() => setToast('Drag the stars to arrange your sky')} title="Help">?</button><button onClick={() => setShowLines(!showLines)} title="Toggle connections">⌁</button><button onClick={restoreDemo} title="Reset view">⤢</button></div>
          </div>
          <div className="sky-footer"><span><span className="grab-hint">⠿</span> Click and drag to rearrange your constellation</span><span>YOUR SPACE IS PRIVATE <span className="lock">⌑</span></span></div>
        </section>
        <section className="bottom-row"><div className="bottom-heading"><div><span className="eyebrow">A LITTLE NUDGE</span><h2>Someone on your mind?</h2></div><button className="text-button" onClick={() => setView('All people')}>See everyone <span>→</span></button></div><div className="nudge-list">{data.people.filter(p => (daysSince(p.lastContact) ?? 999) > 30).slice(0, 3).map(p => <button className="nudge" key={p.id} onClick={() => setSelected(p.id)}><span className={`nudge-star tone-${tone(p.lastContact)}`}>✦</span><span className="nudge-person"><strong>{p.name}</strong><small>{labels[p.relationship]}</small></span><span className="nudge-when">{ageLabel(p.lastContact)}</span><span className="nudge-arrow">↗</span></button>)}{counts.needs === 0 && <p className="all-caught-up">Everyone is feeling close. Keep nurturing those connections. ✨</p>}</div></section>
      </div>
    </section>
    <aside className={`details-panel ${selectedPerson ? 'details-open' : ''}`}>
      {selectedPerson ? <><div className="details-top"><span>PERSONAL ORBIT</span><button className="close-details" aria-label="Close details" onClick={() => setSelected(null)}>×</button></div><div className={`detail-star tone-${tone(selectedPerson.lastContact)}`}><span>✦</span></div><h2 className="person-name">{selectedPerson.name}</h2><div className="person-category"><span className={`category-dot ${selectedPerson.relationship}`} />{labels[selectedPerson.relationship]}</div><div className="last-contact"><span className="contact-icon">◷</span><div><small>LAST CONNECTED</small><strong>{ageLabel(selectedPerson.lastContact)}</strong><span>{selectedPerson.lastContact ? new Date(`${selectedPerson.lastContact}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'No date recorded'}</span></div></div><div className="detail-section"><div className="detail-section-label">A NOTE TO YOURSELF <button onClick={startEdit} aria-label="Edit note">✎</button></div><p className="notes-text">{selectedPerson.notes || <span className="muted">No notes yet. Add a little reminder.</span>}</p></div><div className="detail-section orbit-section"><div className="detail-section-label">CONNECTED STARS <span>{data.connections.filter(c => c.source === selectedPerson.id || c.target === selectedPerson.id).length}</span></div>{data.connections.filter(c => c.source === selectedPerson.id || c.target === selectedPerson.id).slice(0, 4).map(c => { const other = data.people.find(p => p.id === (c.source === selectedPerson.id ? c.target : c.source)); return other ? <div className="orbit-person" key={c.id}><span className={`orbit-dot tone-${tone(other.lastContact)}`} />{other.name}<button onClick={() => void disconnect(c.id)} aria-label={`Disconnect ${other.name}`}>×</button></div> : null })}{data.connections.filter(c => c.source === selectedPerson.id || c.target === selectedPerson.id).length === 0 && <p className="muted small-muted">No connected stars yet.</p>}<button className="connect-link" onClick={() => { setConnectMode(true); setToast('Now choose the star you want to connect') }}>＋ Connect to a person</button></div><div className="activity-section"><div className="detail-section-label">RECENT MOMENTS</div>{data.activities.filter(a => a.personId === selectedPerson.id).slice(0, 3).map(a => <div className="activity-row" key={a.id}><i />Connected on {new Date(`${a.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>)}{!data.activities.some(a => a.personId === selectedPerson.id) && <p className="muted small-muted">Your moments together will live here.</p>}</div><div className="detail-actions"><button className="connected-button" onClick={() => void connectToday()}><span>✦</span> Connected today</button><div><button className="edit-button" onClick={startEdit}>Edit person</button><button className="delete-button" onClick={() => void deletePerson()}>Delete</button></div></div></> : <div className="detail-empty"><div>✧</div><strong>Your people, up close</strong><p>Select a star to see their details, add a note, or record a moment together.</p></div>}
    </aside>
    {authOpen && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setAuthOpen(false) }}><section className="person-modal auth-modal" aria-labelledby="google-title"><div className="modal-top"><div><span className="eyebrow">PRIVATE CLOUD CONSTELLATION</span><h2 id="google-title">Sign in to your sky</h2></div><button className="close-details" aria-label="Close dialog" onClick={() => setAuthOpen(false)}>×</button></div><p className="auth-copy">Your Google account keeps your constellation private and available across your devices.</p><div id="google-sign-in-button" className="google-button-slot" />{(authError || (!import.meta.env.VITE_GOOGLE_CLIENT_ID && 'Set VITE_GOOGLE_CLIENT_ID in .env.local first.')) && <p className="auth-error" role="alert">{authError || 'Set VITE_GOOGLE_CLIENT_ID in .env.local first.'}</p>}<p className="auth-footnote">Your sample constellation stays on this device and is never uploaded.</p></section></div>}
    {modal && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}><form className="person-modal" onSubmit={saveForm} aria-labelledby="modal-title"><div className="modal-top"><div><span className="eyebrow">YOUR UNIVERSE</span><h2 id="modal-title">{modal === 'add' ? 'Add someone special' : 'Edit person'}</h2></div><button type="button" className="close-details" aria-label="Close dialog" onClick={() => setModal(null)}>×</button></div><label>Name<input autoFocus required maxLength={80} placeholder="Their name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Relationship<select value={form.relationship} onChange={e => setForm({ ...form, relationship: e.target.value as Relationship })}>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Last connected<input type="date" max={today.toISOString().slice(0, 10)} value={form.lastContact} onChange={e => setForm({ ...form, lastContact: e.target.value })} /></label><label>A note to yourself<textarea rows={3} maxLength={1000} placeholder="A favorite memory, something to ask about..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label><div className="modal-actions"><button type="button" className="edit-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" type="submit">{modal === 'add' ? 'Add to my sky' : 'Save changes'}</button></div></form></div>}
    {toast && <div className="toast" role="status"><span>✦</span>{toast}</div>}
  </main>
}
export default App











