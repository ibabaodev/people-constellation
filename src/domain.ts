export type Relationship = 'family' | 'friend' | 'coworker' | 'other'
export const relationshipLabels: Record<Relationship, string> = { family: 'Family', friend: 'Friend', coworker: 'Coworker', other: 'Other' }
export type RecencyTone = 'gold' | 'blue' | 'violet' | 'dim' | 'neutral'

export function daysSince(date?: string, referenceTime = Date.now()): number | null {
  if (!date) return null
  const elapsed = referenceTime - new Date(`${date}T00:00:00`).getTime()
  return Math.max(0, Math.floor(elapsed / 86_400_000))
}

export function contactLabel(date?: string, referenceTime = Date.now()): string {
  const days = daysSince(date, referenceTime)
  if (days === null) return 'No recent contact'
  if (days === 0) return 'Connected today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

export function recencyTone(date?: string, referenceTime = Date.now()): RecencyTone {
  const days = daysSince(date, referenceTime)
  if (days === null) return 'neutral'
  if (days <= 7) return 'gold'
  if (days <= 30) return 'blue'
  if (days <= 90) return 'violet'
  return 'dim'
}
