let idToken: string | null = null
const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
export function setIdToken(token: string | null) { idToken = token }
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!apiUrl) throw new Error('Set VITE_API_URL in .env.local to use cloud sync.')
  if (!idToken) throw new Error('Sign in with Google to use cloud sync.')
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json', ...(init.headers ?? {}) } })
  if (!response.ok) {
    let message = `API request failed (${response.status})`
    try { const body = await response.json() as { error?: string; message?: string }; message = body.error ?? body.message ?? message } catch { /* keep the status message */ }
    if (response.status === 409) throw new Error(`${message} Sign out and sign in again to reload the server copy.`)
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
export type RemotePerson = { id: string; name: string; relationship: 'family' | 'friend' | 'coworker' | 'other'; notes?: string; lastContact?: string; position: { x: number; y: number }; createdAt: string; updatedAt: string; version: number }
export type RemoteConnection = { id: string; source: string; target: string }
export type RemoteActivity = { id: string; personId: string; date: string; personVersion?: number }
export const api = {
  people: () => request<{ items: RemotePerson[] }>('/people'),
  createPerson: (person: Omit<RemotePerson, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => request<RemotePerson>('/people', { method: 'POST', body: JSON.stringify(person) }),
  updatePerson: (person: RemotePerson) => request<RemotePerson>(`/people/${encodeURIComponent(person.id)}`, { method: 'PUT', headers: { 'if-match': String(person.version) }, body: JSON.stringify({ name: person.name, relationship: person.relationship, notes: person.notes, lastContact: person.lastContact ?? null, position: person.position }) }),
  deletePerson: (id: string) => request<void>(`/people/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  connections: () => request<{ items: RemoteConnection[] }>('/connections'),
  createConnection: (source: string, target: string) => request<RemoteConnection>('/connections', { method: 'POST', body: JSON.stringify({ source, target }) }),
  deleteConnection: (id: string) => request<void>(`/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  activities: (personId: string) => request<{ items: RemoteActivity[] }>(`/people/${encodeURIComponent(personId)}/activities`),
  addActivity: (personId: string, date: string) => request<RemoteActivity>(`/people/${encodeURIComponent(personId)}/activities`, { method: 'POST', body: JSON.stringify({ date }) }),
}


