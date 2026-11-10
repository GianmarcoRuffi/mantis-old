import assert from 'node:assert/strict'
import test from 'node:test'
import { cases, loadFixture, validateFixture, validateReference, compareRows, referenceCheck,
  calculationMatches, type Reference, type Standing } from './support'

const row: Standing = { playerId: 'P01', rank: 1, matchPoints: 3,
  tiebreaker1: -1, tiebreaker2: 1, tiebreaker3: 0 }

test('comparator detects an altered value with full diagnostic coordinates', () => {
  assert.deepEqual(compareRows('132', 2, 'ui', [row], [{ ...row, tiebreaker2: 99 }]), [{
    tournament: '132', round: 2, player: 'P01', layer: 'ui', field: 'tiebreaker2', expected: 1, actual: 99,
  }])
})

test('equal numerical tiebreakers do not hide different player order', () => {
  const second = { ...row, playerId: 'P02', rank: 2 }
  const differences = compareRows('132', 1, 'calculation', [row, second],
    [{ ...second, rank: 1 }, { ...row, rank: 2 }])
  assert.ok(differences.some(d => d.field === 'rank'))
  assert.equal(differences.filter(d => d.field === 'rowOrder').length, 2)
})

test('comparator detects missing, unexpected and duplicate participants', () => {
  const differences = compareRows('132', 1, 'stored', [row, { ...row, playerId: 'P02' }],
    [row, row, { ...row, playerId: 'P03' }])
  for (const field of ['rowCount', 'missingPlayer', 'unexpectedPlayer', 'duplicate'])
    assert.ok(differences.some(d => d.field === field), field)
})

test('missing legacy reference is BLOCKED, never a successful parity check', () => {
  assert.equal(referenceCheck(loadFixture('132'), null, 1, 'calculation', [row]).status, 'BLOCKED')
})

test('fixtures cover exactly seven rounds and 61 participant checkpoints', () => {
  const fixtures = cases.map(loadFixture)
  assert.equal(fixtures.reduce((n, f) => n + f.rounds.length, 0), 7)
  assert.equal(fixtures.reduce((n, f) => n + f.players.length * f.rounds.length, 0), 61)
  assert.equal(fixtures[0].rounds.flatMap(r => r.matches).filter(m => m.isBye).length, 0)
  assert.equal(fixtures[1].rounds.flatMap(r => r.matches).filter(m => m.isBye).length, 3)
  // 132 really exercises the -3 opponent contribution limit at round four.
  const losers = fixtures[0].players.filter(p => fixtures[0].rounds.every(r =>
    r.matches.some(m => [m.player1Id, m.player2Id].includes(p) && m.winnerId !== p)))
  assert.equal(losers.length, 1)
})

test('fixture validation rejects missing reciprocal evidence and duplicate round participants', () => {
  const a = structuredClone(loadFixture('132'))
  a.rounds[0].matches[0].legacyRows.pop()
  assert.throws(() => validateFixture(a), /reciprocal/)
  const b = structuredClone(loadFixture('132'))
  b.rounds[0].matches.push(b.rounds[0].matches[0])
  assert.throws(() => validateFixture(b), /duplicate/)
})

test('adapter uses match outcomes, not legacy MatchPts or later rounds', () => {
  const fixture = loadFixture('132')
  const roundOne = calculationMatches(fixture, 1)
  assert.equal(roundOne.length, 5)
  assert.ok(roundOne.every(m => m.roundNumber === 1))
  const altered = structuredClone(fixture)
  for (const r of altered.rounds) for (const m of r.matches)
    for (const row of m.legacyRows) row.matchPts = 999
  assert.deepEqual(calculationMatches(altered, 1), roundOne)
  const byes = calculationMatches(loadFixture('134'), 3).filter(m => m.isBye)
  assert.ok(byes.every(m => m.player2Id === null && m.result === 'P1_WIN'))
})

test('reference validation requires provenance, complete rounds, integer values and original order', () => {
  const fixture = loadFixture('132')
  // Synthetic validation input only: never persisted or used as a legacy oracle.
  const reference: Reference = { schemaVersion: 1, legacyTournamentId: '132',
    sourceDatabaseSha256: fixture.sourceDatabaseSha256, capturedAt: '2026-11-10T12:00:00Z',
    semantics: { points: 'Synthetic validation only', results: 'Synthetic validation only' },
    evidence: [{ file: 'example.xml', sha256: 'a'.repeat(64) }, { file: 'example.html', sha256: 'b'.repeat(64) }],
    rounds: fixture.rounds.map(r => ({ number: r.number, evidence: ['example.xml', 'example.html'],
      standings: fixture.players.map((p, i) => ({ ...row, playerId: p, rank: i + 1 })) })) }
  validateReference(fixture, reference)
  const incomplete = structuredClone(reference)
  incomplete.rounds.pop()
  assert.throws(() => validateReference(fixture, incomplete), /rounds/)
  const misordered = structuredClone(reference)
  misordered.rounds[0].standings.reverse()
  assert.throws(() => validateReference(fixture, misordered), /order/)
  const missingValue = structuredClone(reference)
  missingValue.rounds[0].standings[0].matchPoints = null as unknown as number
  assert.throws(() => validateReference(fixture, missingValue), /row/)
  const wrongSource = structuredClone(reference)
  wrongSource.sourceDatabaseSha256 = 'b'.repeat(64)
  assert.throws(() => validateReference(fixture, wrongSource), /provenance/)
})
