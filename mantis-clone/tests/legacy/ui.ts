import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium, type Page, type Locator } from 'playwright'
import type { PrismaClient } from '@prisma/client'
import { calculateStandings } from '../../src/lib/standings'
import { cases, loadFixture, loadReference, compareRows, referenceCheck,
  type Fixture, type Standing, type Check, type Difference } from './support'

type Options = { baseUrl: string; db: PrismaClient; checks: Check[]; artifacts: string; restart: () => Promise<void> }

export async function replay({ baseUrl, db, checks, artifacts, restart }: Options) {
  const browser = await chromium.launch({ headless: process.env.MANTIS_LEGACY_HEADLESS === '1' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  page.setDefaultNavigationTimeout(90_000)
  const browserErrors: string[] = []
  context.on('page', p => p.on('pageerror', error => browserErrors.push(error.message)))
  page.on('pageerror', error => browserErrors.push(error.message))
  const completed: Array<{ fixture: Fixture; id: string; aliases: Map<string, string> }> = []
  let currentTournament = '*'
  let currentRound = 0
  const add = (tournament: string, round: number, layer: string, differences: Difference[], detail?: string) => {
    checks.push({ tournament, round, layer, status: differences.length ? 'FAIL' : 'PASS', differences, detail })
  }
  const consistency = (f: Fixture, round: number, layer: string, expected: Standing[], actual: Standing[]) =>
    add(f.legacyTournamentId, round, layer, compareRows(f.legacyTournamentId, round, layer, expected, actual))
  async function visit(url: string, target = page) {
    const response = await target.goto(url, { waitUntil: 'networkidle' })
    assert.ok(response?.ok(), `HTTP failure: ${url}`)
  }
  async function action(target: Page, trigger: () => Promise<unknown>) {
    const [response] = await Promise.all([
      target.waitForResponse(r => r.request().method() === 'POST' && r.url().startsWith(baseUrl)), trigger(),
    ])
    assert.ok(response.ok() || response.status() === 303, `Server action HTTP ${response.status()}`)
    await response.finished()
    await target.waitForLoadState('networkidle')
  }
  const formFor = (name: string, target = page): Locator => target.locator('form').filter({
    has: target.getByRole('button', { name, exact: true }),
  })
  async function readUi(f: Fixture, target = page): Promise<Standing[]> {
    const rows = await target.locator('table tbody tr').evaluateAll(elements =>
      elements.map(e => Array.from(e.querySelectorAll('td'), c => c.textContent?.trim() ?? '')))
    return rows.filter(cells => cells.length === 6).map(cells => {
      const playerId = cells[1].replace(`Legacy${f.legacyTournamentId} `, '')
      assert.ok(f.players.includes(playerId), `Unexpected UI player: ${cells[1]}`)
      const values = [cells[0], ...cells.slice(2)].map(Number)
      assert.ok(values.every(Number.isSafeInteger), 'Non-integer UI standings')
      return { playerId, rank: values[0], matchPoints: values[1], tiebreaker1: values[2],
        tiebreaker2: values[3], tiebreaker3: values[4] }
    })
  }
  async function persisted(tournamentId: string, round: number, aliases: Map<string, string>): Promise<Standing[]> {
    const rows = await db.standing.findMany({ where: { tournamentId, roundNumber: round }, orderBy: { rank: 'asc' } })
    return rows.map(s => ({ playerId: aliases.get(s.playerId)!, rank: s.rank!, matchPoints: s.matchPoints,
      tiebreaker1: s.tiebreaker1, tiebreaker2: s.tiebreaker2, tiebreaker3: s.tiebreaker3 }))
  }
  async function calculated(tournamentId: string, round: number, aliases: Map<string, string>): Promise<Standing[]> {
    const enrollments = await db.enrollment.findMany({ where: { tournamentId } })
    const matches = await db.match.findMany({ where: { tournamentId, roundNumber: { lte: round } },
      orderBy: [{ roundNumber: 'asc' }, { tableNumber: 'asc' }, { id: 'asc' }] })
    return calculateStandings(enrollments.map(e => e.playerId), matches).map((s, i) => ({
      playerId: aliases.get(s.playerId)!, rank: i + 1, matchPoints: s.matchPoints,
      tiebreaker1: s.tiebreaker1, tiebreaker2: s.tiebreaker2, tiebreaker3: s.tiebreaker3,
    }))
  }
  async function verifyResults(f: Fixture, tournamentId: string, round: number, aliases: Map<string, string>, layer: string) {
    const actual = await db.match.findMany({ where: { tournamentId, roundNumber: round } })
    const expected = f.rounds[round - 1].matches
    const differences: Difference[] = []
    const diff = (player: string, field: string, e: unknown, a: unknown) =>
      differences.push({ tournament: f.legacyTournamentId, round, player, layer, field, expected: e, actual: a })
    if (actual.length !== expected.length) diff('*', 'matchCount', expected.length, actual.length)
    for (const match of expected) {
      const found = actual.filter(m => aliases.get(m.player1Id!) === match.player1Id &&
        (m.player2Id ? aliases.get(m.player2Id) : null) === match.player2Id)
      if (found.length !== 1) { diff(match.player1Id, 'pairingCount', 1, found.length); continue }
      const m = found[0]
      if (m.isBye !== match.isBye) diff(match.player1Id, 'isBye', match.isBye, m.isBye)
      const winner = m.result === 'P1_WIN' ? aliases.get(m.player1Id!) :
        m.result === 'P2_WIN' ? aliases.get(m.player2Id!) : m.result
      if (winner !== match.winnerId) diff(match.player1Id, 'winnerId', match.winnerId, winner)
      const score = match.winnerId === match.player1Id ? [2, 0] : [0, 2]
      if (m.gamesWon1 !== score[0] || m.gamesWon2 !== score[1])
        diff(match.player1Id, 'cloneGameScore', score, [m.gamesWon1, m.gamesWon2])
    }
    // Read displayed outcomes too, including historical and post-restart pages.
    for (const match of expected) {
      if (match.isBye) {
        const card = page.locator('div.rounded.border.bg-white.p-4.shadow-sm').filter({ hasText: `Legacy${f.legacyTournamentId} ${match.player1Id}` })
        if (await card.getByText('- BYE -', { exact: true }).count() !== 1)
          diff(match.player1Id, 'uiBye', true, false)
      } else {
        const label = `Vince Legacy${f.legacyTournamentId} ${match.winnerId}`
        if (await page.getByText(label, { exact: true }).count() !== 1)
          diff(match.player1Id, 'uiWinner', label, 'missing or duplicate')
      }
    }
    add(f.legacyTournamentId, round, layer, differences)
  }
  async function verifyRound(f: Fixture, tournamentId: string, round: number, aliases: Map<string, string>, phase: string) {
    await visit(`${baseUrl}/tournaments/${tournamentId}?round=${round}`)
    const reference = loadReference(f)
    const ui = await readUi(f)
    const stored = await persisted(tournamentId, round, aliases)
    const calc = await calculated(tournamentId, round, aliases)
    for (const [layer, rows] of [['calculation', calc], ['stored', stored], ['ui', ui]] as const)
      checks.push(referenceCheck(f, reference, round, `${phase}/${layer}`, rows))
    consistency(f, round, `${phase}/stored-v-calculation`, calc, stored)
    consistency(f, round, `${phase}/ui-v-stored`, stored, ui)
    await verifyResults(f, tournamentId, round, aliases, `${phase}/results`)
    return ui
  }
  try {
    for (const legacyId of cases) {
      const f = loadFixture(legacyId)
      // Validate any supplied reference before starting the replay.
      loadReference(f)
      currentTournament = legacyId
      currentRound = 0
      console.log(`Torneo ${legacyId}: iscrizioni e replay di ${f.rounds.length} turni`)
      await visit(`${baseUrl}/tournaments/new`)
      await page.locator('input[name=name]').fill(`Legacy parity ${legacyId}`)
      await page.locator('input[name=roundCount]').fill(String(f.rounds.length))
      await page.locator('select[name=gameId]').selectOption('1')
      await page.locator('select[name=type]').selectOption('SWISS')
      await page.locator('select[name=format]').selectOption('CONSTRUCTED')
      await action(page, () => page.getByRole('button', { name: 'Crea', exact: true }).click())
      await page.waitForURL(url => /^\/tournaments\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'))
      const tournamentId = new URL(page.url()).pathname.split('/').at(-1)!
      for (const alias of f.players) {
        const form = formFor('Crea e Iscrivi')
        await form.locator('input[name=firstName]').fill(alias)
        await form.locator('input[name=lastName]').fill(`Legacy${legacyId}`)
        await action(page, () => form.getByRole('button', { name: 'Crea e Iscrivi', exact: true }).click())
      }
      const tournament = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId },
        include: { enrollments: { include: { player: true } } } })
      assert.equal(tournament.enrollments.length, f.players.length)
      const aliases = new Map(tournament.enrollments.map(e => [e.playerId, e.player.firstName]))
      const ids = new Map(Array.from(aliases, ([id, alias]) => [alias, id]))
      let previousUi: Standing[] = []
      for (const round of f.rounds) {
        currentRound = round.number
        console.log(`  ${legacyId}: turno ${round.number}`)
        await action(page, () => page.getByRole('button', { name: `Avvia Round ${round.number}`, exact: true }).click())
        await visit(`${baseUrl}/tournaments/${tournamentId}`)
        consistency(f, round.number, 'open-round/previous-standings', previousUi, await readUi(f))
        assert.equal(await page.getByRole('button', { name: 'Fine Round', exact: true }).isEnabled(), false)
        const generated = await db.match.findMany({ where: { tournamentId, roundNumber: round.number } })
        // Prepare confirmations while the pool is empty. The current UI hides the next
        // split confirmation once a first player has entered the manual pool.
        const confirmations: Page[] = []
        try {
          for (const m of generated) {
            const tab = await context.newPage()
            confirmations.push(tab)
            await visit(`${baseUrl}/tournaments/${tournamentId}?round=${round.number}&manualPairing=1&sourceMatchId=${m.id}`, tab)
            await tab.getByRole('button', { name: 'Conferma Split', exact: true }).waitFor()
          }
          for (let index = 0; index < confirmations.length; index++) {
            const tab = confirmations[index]
            await action(tab, () => tab.getByRole('button', { name: 'Conferma Split', exact: true }).click())
            if (index === 0 && generated.length > 1) {
              await visit(`${baseUrl}/tournaments/${tournamentId}?round=${round.number}&manualPairing=1&sourceMatchId=${generated[1].id}`)
              const available = await page.getByRole('button', { name: 'Conferma Split', exact: true }).count()
              const differences: Difference[] = available ? [] : [{ tournament: legacyId, round: round.number,
                player: '*', layer: 'manual-pool-navigation', field: 'splitConfirmationAvailable', expected: true, actual: false }]
              add(legacyId, round.number, 'manual-pool-navigation', differences,
                available ? undefined : 'Conferma Split scompare con pool attivo. Replay proseguito con conferme predisposte in schede separate; nessuna modifica applicativa.')
              if (!available && round.number === 1)
                await page.screenshot({ path: path.join(artifacts, `${legacyId}-manual-pool.png`), fullPage: true })
            }
          }
        } finally { await Promise.all(confirmations.map(tab => tab.close())) }
        await visit(`${baseUrl}/tournaments/${tournamentId}?round=${round.number}&manualPairing=1`)
        for (const m of round.matches.filter(m => !m.isBye)) {
          const form = formFor('Crea Abbinamento Manuale')
          await form.locator('select[name=player1Id]').selectOption(ids.get(m.player1Id)!)
          await form.locator('select[name=player2Id]').selectOption(ids.get(m.player2Id!)!)
          await action(page, () => form.getByRole('button', { name: 'Crea Abbinamento Manuale', exact: true }).click())
        }
        for (const m of round.matches.filter(m => m.isBye)) {
          const form = formFor('Assegna BYE')
          await form.locator('select[name=playerId]').selectOption(ids.get(m.player1Id)!)
          await action(page, () => form.getByRole('button', { name: 'Assegna BYE', exact: true }).click())
        }
        await visit(`${baseUrl}/tournaments/${tournamentId}?round=${round.number}`)
        for (const m of round.matches.filter(m => !m.isBye)) {
          const winner = page.locator(`input[type=radio][name=winnerId][value="${ids.get(m.winnerId)}"]`)
          await action(page, () => winner.check())
          await visit(`${baseUrl}/tournaments/${tournamentId}?round=${round.number}`)
          assert.ok(await winner.isChecked(), `Winner not visible: ${legacyId}/${round.number}/${m.winnerId}`)
          consistency(f, round.number, `partial/${m.winnerId}/previous-standings`, previousUi, await readUi(f))
        }
        await verifyResults(f, tournamentId, round.number, aliases, 'before-close/results')
        await action(page, () => page.getByRole('button', { name: 'Fine Round', exact: true }).click())
        previousUi = await verifyRound(f, tournamentId, round.number, aliases, 'closed-round')
        await page.reload({ waitUntil: 'networkidle' })
        consistency(f, round.number, 'reload/ui', previousUi, await readUi(f))
        await page.screenshot({ path: path.join(artifacts, `${legacyId}-round-${round.number}.png`), fullPage: true })
      }
      await action(page, () => page.getByRole('button', { name: 'Chiudi Torneo', exact: true }).click())
      assert.equal((await db.tournament.findUniqueOrThrow({ where: { id: tournamentId } })).progress, 'FINISHED')
      for (const r of f.rounds) await verifyRound(f, tournamentId, r.number, aliases, 'history')
      completed.push({ fixture: f, id: tournamentId, aliases })
    }
    console.log('Riavvio server e verifica di tutti i turni persistiti')
    await restart()
    for (const t of completed) for (const round of t.fixture.rounds)
      await verifyRound(t.fixture, t.id, round.number, t.aliases, 'restart')
    add('*', 0, 'browser-errors', browserErrors.map(error => ({ tournament: '*', round: 0,
      player: '*', layer: 'browser-errors', field: 'pageerror', expected: null, actual: error })))
  } catch (error) {
    checks.push({ tournament: currentTournament, round: currentRound, layer: 'ui-execution',
      status: 'FAIL', differences: [], detail: String(error) })
    await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally { await browser.close() }
}
