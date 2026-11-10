import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cases, fixtureDir, root, loadFixture, validateReference, type Reference } from '../tests/legacy/support'

const [command, id, input, exportsDirectory] = process.argv.slice(2)
if (!cases.includes(id as typeof cases[number]) || !['template', 'import'].includes(command)) {
  throw new Error('Usage: legacy:reference -- template 132 output.json | import 132 input.json exports-directory')
}
const fixture = loadFixture(id)
if (!input) throw new Error('Specify an input/output JSON path outside the fixture directory')
const inputPath = path.resolve(input)
if (inputPath.startsWith(fixtureDir + path.sep)) throw new Error('Use a working JSON outside the fixture directory')
if (command === 'template') {
  if (existsSync(inputPath)) throw new Error('Refusing to overwrite an existing template')
  const template = { schemaVersion: 1, legacyTournamentId: id,
    sourceDatabaseSha256: fixture.sourceDatabaseSha256, capturedAt: null,
    semantics: { points: '', results: '' }, evidence: [{ file: `${id}.xml`, sha256: '' },
      ...fixture.rounds.map(r => ({ file: `${id}-round-${r.number}.html`, sha256: '' }))],
    rounds: fixture.rounds.map(round => ({ number: round.number, evidence: [`${id}.xml`, `${id}-round-${round.number}.html`],
      standings: fixture.players.map(playerId => ({ playerId, rank: null, matchPoints: null,
        tiebreaker1: null, tiebreaker2: null, tiebreaker3: null })) })) }
  writeFileSync(inputPath, JSON.stringify(template, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  console.log('Template created. Fill from the ORIGINAL export, reorder by legacy position; no expected values calculated.')
} else {
  if (!exportsDirectory) throw new Error('Original export directory required')
  const reference: Reference = JSON.parse(readFileSync(inputPath, 'utf8'))
  if (!Array.isArray(reference.evidence)) throw new Error('Missing original export evidence')
  const archive = path.join(root, '.legacy-local/exports', id)
  // Validate file names before reading any path supplied by the transcription.
  for (const evidence of reference.evidence) {
    if (!/^[\w.-]+\.(xml|html|htm)$/i.test(evidence.file)) throw new Error('Invalid export filename')
    const data = readFileSync(path.resolve(exportsDirectory, evidence.file))
    if (!data.length) throw new Error('Empty export')
    const sha256 = createHash('sha256').update(data).digest('hex')
    if (evidence.sha256 && evidence.sha256 !== sha256) throw new Error('Export SHA256 mismatch')
    evidence.sha256 = sha256
  }
  validateReference(fixture, reference)
  mkdirSync(archive, { recursive: true, mode: 0o700 })
  for (const evidence of reference.evidence)
    copyFileSync(path.resolve(exportsDirectory, evidence.file), path.join(archive, evidence.file))
  writeFileSync(path.join(fixtureDir, `${id}.reference.json`), JSON.stringify(reference, null, 2) + '\n')
  console.log(`${id}: reference validated and saved; original exports archived locally (not committed).`)
}
