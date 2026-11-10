import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateStandings } from '../../src/lib/standings'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const fixtureDir = path.join(root, 'tests/fixtures/legacy')
export const cases = ['132', '134'] as const
export const fields = ['rank', 'matchPoints', 'tiebreaker1', 'tiebreaker2', 'tiebreaker3'] as const
export type Standing = { playerId: string; rank: number; matchPoints: number;
  tiebreaker1: number; tiebreaker2: number; tiebreaker3: number }
export type Encounter = { tableNumber: number; player1Id: string; player2Id: string | null;
  winnerId: string; isBye: boolean; legacyRows: Array<{ playerId: string; gamesWon: number;
  gamesLost: number; matchPts: number; placement: number }> }
export type Fixture = { schemaVersion: number; legacyTournamentId: string; sourceDatabaseSha256: string;
  game: string; type: string; format: string; players: string[];
  rounds: Array<{ number: number; matches: Encounter[] }> }
export type Reference = { schemaVersion: number; legacyTournamentId: string; sourceDatabaseSha256: string;
  capturedAt: string; semantics: { points: string; results: string };
  evidence: Array<{ file: string; sha256: string }>;
  rounds: Array<{ number: number; evidence: string[]; standings: Standing[] }> }
export type Difference = { tournament: string; round: number; player: string; layer: string;
  field: string; expected: unknown; actual: unknown }
export type Check = { tournament: string; round: number; layer: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED'; differences: Difference[]; detail?: string; observed?: Standing[] }

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function validateFixture(f: Fixture) {
  const counts: Record<string, [number, number]> = { '132': [10, 4], '134': [7, 3] }
  const count = counts[f.legacyTournamentId]
  requireCondition(count && f.schemaVersion === 1, 'Unknown fixture/version')
  requireCondition(/^[a-f0-9]{64}$/.test(f.sourceDatabaseSha256), 'Missing source database SHA256')
  requireCondition(f.players.length === count[0] && new Set(f.players).size === count[0] &&
    f.players.every(p => /^P\d{2}$/.test(p)), 'Invalid participant aliases')
  requireCondition(f.rounds.length === count[1], 'Missing fixture rounds')
  f.rounds.forEach((round, index) => {
    requireCondition(round.number === index + 1, 'Rounds must be sequential')
    const seen: string[] = []
    for (const m of round.matches) {
      requireCondition(Number.isInteger(m.tableNumber) && m.tableNumber >= 0, 'Invalid table')
      requireCondition(f.players.includes(m.player1Id) &&
        (m.isBye ? m.player2Id === null && m.winnerId === m.player1Id :
          m.player2Id !== null && f.players.includes(m.player2Id) && m.player1Id !== m.player2Id &&
          [m.player1Id, m.player2Id].includes(m.winnerId)), 'Invalid pairing/result')
      seen.push(m.player1Id)
      if (m.player2Id) seen.push(m.player2Id)
      requireCondition(m.legacyRows.length === 2, 'Missing reciprocal evidence')
      const seats = [...m.legacyRows].sort((a, b) => a.placement - b.placement)
      requireCondition(seats[0].placement === 1 && seats[1].placement === 2 &&
        seats[0].gamesWon === seats[1].gamesLost && seats[0].gamesLost === seats[1].gamesWon,
      'Conflicting reciprocal evidence')
      requireCondition(seats.some(s => s.playerId === m.winnerId && s.gamesWon === 1 && s.gamesLost === 0) &&
        seats.every(s => Number.isInteger(s.matchPts) &&
          ((s.gamesWon === 1 && s.gamesLost === 0) || (s.gamesWon === 0 && s.gamesLost === 1))) &&
        seats.map(s => s.playerId).sort().join(',') === [m.player1Id, m.player2Id ?? 'BYE'].sort().join(','),
      'Legacy result does not match encounter')
    }
    requireCondition(seen.length === f.players.length && new Set(seen).size === f.players.length,
      'Missing/duplicate round participant')
    requireCondition(round.matches.filter(m => m.isBye).length === f.players.length % 2, 'Invalid bye count')
  })
}

export function validateReference(f: Fixture, r: Reference) {
  requireCondition(r.schemaVersion === 1 && r.legacyTournamentId === f.legacyTournamentId &&
    r.sourceDatabaseSha256 === f.sourceDatabaseSha256, 'Reference provenance does not match fixture')
  requireCondition(typeof r.capturedAt === 'string' && Number.isFinite(Date.parse(r.capturedAt)), 'Missing capture date')
  requireCondition(typeof r.semantics?.points === 'string' && r.semantics.points.trim() &&
    typeof r.semantics.results === 'string' && r.semantics.results.trim(), 'Document points/result semantics')
  requireCondition(Array.isArray(r.evidence) && r.evidence.length > 0 &&
    r.evidence.every(e => /^[a-f0-9]{64}$/.test(e.sha256) &&
      /^[\w.-]+\.(xml|html|htm)$/i.test(e.file)) &&
    r.evidence.some(e => /\.xml$/i.test(e.file)) && r.evidence.some(e => /\.html?$/i.test(e.file)) &&
    new Set(r.evidence.map(e => e.file)).size === r.evidence.length, 'Invalid export evidence')
  requireCondition(r.rounds.length === f.rounds.length, 'Missing reference rounds')
  r.rounds.forEach((round, index) => {
    requireCondition(round.number === index + 1 && round.evidence.length > 0 &&
      round.evidence.every(file => r.evidence.some(e => e.file === file)) &&
      round.evidence.some(file => /\.xml$/i.test(file)) && round.evidence.some(file => /\.html?$/i.test(file)),
    'Missing round XML/HTML evidence')
    requireCondition(round.standings.length === f.players.length &&
      new Set(round.standings.map(s => s.playerId)).size === f.players.length, 'Incomplete reference standings')
    round.standings.forEach((s, i) => {
      requireCondition(f.players.includes(s.playerId) && s.rank >= 1 && s.rank <= f.players.length &&
        (i === 0 || s.rank >= round.standings[i - 1].rank) &&
        fields.every(field => Number.isSafeInteger(s[field])), 'Invalid reference row/order')
    })
  })
}

export function loadFixture(id: string): Fixture {
  const fixture: Fixture = JSON.parse(readFileSync(path.join(fixtureDir, `${id}.json`), 'utf8'))
  validateFixture(fixture)
  return fixture
}

export function loadReference(f: Fixture): Reference | null {
  const file = path.join(fixtureDir, `${f.legacyTournamentId}.reference.json`)
  if (!existsSync(file)) return null
  const reference: Reference = JSON.parse(readFileSync(file, 'utf8'))
  validateReference(f, reference)
  return reference
}

// Legacy 1/0 represents a match outcome. The UI currently writes 2/0 game scores.
// We preserve the raw rows and never import MatchPts into the app's matchPoints.
export function calculationMatches(f: Fixture, throughRound: number) {
  return f.rounds.filter(r => r.number <= throughRound).flatMap(r => r.matches.map(m => ({
    player1Id: m.player1Id, player2Id: m.player2Id, roundNumber: r.number,
    isBye: m.isBye, result: m.winnerId === m.player1Id ? 'P1_WIN' : 'P2_WIN',
    gamesWon1: m.winnerId === m.player1Id ? 2 : 0,
    gamesWon2: m.winnerId === m.player2Id ? 2 : 0,
  })))
}

export function calculatedRows(f: Fixture, round: number): Standing[] {
  return calculateStandings(f.players, calculationMatches(f, round)).map((s, i) => ({
    playerId: s.playerId, rank: i + 1, matchPoints: s.matchPoints,
    tiebreaker1: s.tiebreaker1, tiebreaker2: s.tiebreaker2, tiebreaker3: s.tiebreaker3,
  }))
}

export function compareRows(tournament: string, round: number, layer: string,
  expected: Standing[], actual: Standing[]): Difference[] {
  const differences: Difference[] = []
  const add = (player: string, field: string, e: unknown, a: unknown) =>
    differences.push({ tournament, round, player, layer, field, expected: e, actual: a })
  if (expected.length !== actual.length) add('*', 'rowCount', expected.length, actual.length)
  const seen = new Set<string>()
  actual.forEach((row, index) => {
    if (seen.has(row.playerId)) add(row.playerId, 'duplicate', false, true)
    seen.add(row.playerId)
    const exp = expected.find(s => s.playerId === row.playerId)
    if (!exp) { add(row.playerId, 'unexpectedPlayer', false, true); return }
    for (const field of fields) if (exp[field] !== row[field]) add(row.playerId, field, exp[field], row[field])
    if (expected[index]?.playerId !== row.playerId)
      add(row.playerId, 'rowOrder', expected[index]?.playerId ?? null, row.playerId)
  })
  for (const row of expected) if (!seen.has(row.playerId)) add(row.playerId, 'missingPlayer', false, true)
  return differences
}

export function referenceCheck(f: Fixture, reference: Reference | null, round: number,
  layer: string, actual: Standing[]): Check {
  if (!reference) return { tournament: f.legacyTournamentId, round, layer, status: 'BLOCKED',
    differences: [], observed: actual, detail: 'Export XML/HTML legacy assente; coincidenza non certificabile.' }
  const differences = compareRows(f.legacyTournamentId, round, layer, reference.rounds[round - 1].standings, actual)
  return { tournament: f.legacyTournamentId, round, layer,
    status: differences.length ? 'FAIL' : 'PASS', differences, observed: actual }
}

export function saveReport(name: string, checks: Check[], details: Record<string, unknown> = {}) {
  const status = checks.some(c => c.status === 'FAIL') ? 'FAIL' :
    checks.some(c => c.status === 'BLOCKED') || !checks.length ? 'BLOCKED' : 'PASS'
  const directory = path.join(root, 'test-results/legacy')
  mkdirSync(directory, { recursive: true })
  const report = { status, generatedAt: new Date().toISOString(), ...details, checks }
  writeFileSync(path.join(directory, `${name}.json`), JSON.stringify(report, null, 2) + '\n')
  const lines = [`# Legacy parity: ${status}`, '',
    '| Torneo | Turno | Livello | Esito |', '|---|---|---|---|',
    ...checks.map(c => `| ${c.tournament} | ${c.round} | ${c.layer} | ${c.status} |`), '',
    'BLOCKED non equivale a PASS. I valori attesi devono provenire dal legacy.', '',
    ...checks.flatMap(c => [ ...(c.detail ? [`- ${c.tournament}/${c.round}: ${c.detail}`] : []),
      ...c.differences.map(d => `- ${d.tournament}/${d.round}/${d.player} [${d.layer}] ${d.field}: atteso ${JSON.stringify(d.expected)}, ottenuto ${JSON.stringify(d.actual)}`) ])]
  writeFileSync(path.join(directory, `${name}.md`), lines.join('\n') + '\n')
  console.log(`${name}: ${status}; ${checks.filter(c => c.status === 'PASS').length} PASS, ` +
    `${checks.filter(c => c.status === 'FAIL').length} FAIL, ${checks.filter(c => c.status === 'BLOCKED').length} BLOCKED`)
  console.log(`Rapporto: test-results/legacy/${name}.md`)
  return status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2
}
