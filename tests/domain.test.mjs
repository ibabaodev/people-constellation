import test from 'node:test'
import assert from 'node:assert/strict'
import { contactLabel, daysSince, recencyTone } from '../src/domain.ts'

const reference = new Date('2026-11-12T12:00:00').getTime()
const at = (days) => new Date(reference - days * 86_400_000).toISOString().slice(0, 10)

test('contact age handles missing and current dates', () => {
  assert.equal(daysSince(undefined, reference), null)
  assert.equal(daysSince(at(0), reference), 0)
  assert.equal(contactLabel(at(0), reference), 'Connected today')
  assert.equal(contactLabel(at(1), reference), '1 day ago')
})

test('recency colors follow the documented age ranges', () => {
  assert.equal(recencyTone(undefined, reference), 'neutral')
  assert.equal(recencyTone(at(7), reference), 'gold')
  assert.equal(recencyTone(at(8), reference), 'blue')
  assert.equal(recencyTone(at(30), reference), 'blue')
  assert.equal(recencyTone(at(31), reference), 'violet')
  assert.equal(recencyTone(at(90), reference), 'violet')
  assert.equal(recencyTone(at(91), reference), 'dim')
})

test('future contact dates do not produce negative age', () => {
  assert.equal(daysSince(at(-2), reference), 0)
})
