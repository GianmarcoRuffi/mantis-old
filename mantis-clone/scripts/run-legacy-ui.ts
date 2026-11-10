import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { PrismaClient } from '@prisma/client'
import { root, saveReport, type Check } from '../tests/legacy/support'
import { replay } from '../tests/legacy/ui'

const checks: Check[] = []
const workspace = mkdtempSync(path.join(tmpdir(), 'mantis-legacy-'))
const project = path.join(workspace, 'app')
const database = path.join(workspace, 'replay.db')
const databaseUrl = `file:${database}`
let server: ChildProcess | undefined
let db: PrismaClient | undefined
let stopping = false
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const logDirectory = path.join(root, 'test-results/legacy')
mkdirSync(logDirectory, { recursive: true })
const serverLog = createWriteStream(path.join(logDirectory, 'server.log'))
const sourceFingerprints = new Map<string, string>()

function fingerprint(databasePath: string) {
  return execFileSync('python3', ['-c', `import hashlib, sqlite3, sys
from pathlib import Path
with sqlite3.connect(Path(sys.argv[1]).as_uri() + '?mode=ro', uri=True) as db:
    digest = hashlib.sha256()
    for line in db.iterdump():
        digest.update(line.encode('utf-8'))
        digest.update(b'\\n')
    print(digest.hexdigest())
`, databasePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

async function stopServer() {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return
  const child = server
  const exited = once(child, 'exit')
  process.kill(-child.pid!, 'SIGTERM')
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid!, 'SIGKILL')
  }, 5000)
  try { await exited } finally { clearTimeout(timer) }
}

async function cleanup() {
  if (stopping) return
  stopping = true
  await stopServer()
  await db?.$disconnect()
  serverLog.end()
  rmSync(workspace, { recursive: true, force: true })
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
})

async function main() {
  const generatedSchema = readFileSync(path.join(root, 'node_modules/.prisma/client/schema.prisma'), 'utf8')
  if (!/url\s*=\s*env\("DATABASE_URL"\)/.test(generatedSchema))
    throw new Error('Prisma client obsoleto: DATABASE_URL non configurabile. Esegui npm run db:generate prima del replay.')
  const source = path.join(root, 'prisma/test.db')
  if (!existsSync(source)) throw new Error('prisma/test.db missing. Run npm run db:test:prepare first.')
  for (const name of ['prisma/dev.db', 'prisma/test.db']) {
    const file = path.join(root, name)
    if (existsSync(file)) sourceFingerprints.set(file, fingerprint(file))
  }
  // SQLite backup handles WAL correctly. The source is opened read-only.
  execFileSync('python3', ['-c', `import sqlite3, sys
from pathlib import Path
source, target = sys.argv[1:]
with sqlite3.connect(Path(source).as_uri() + '?mode=ro', uri=True) as origin, sqlite3.connect(target) as copy:
    origin.backup(copy)
    if copy.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or copy.execute('PRAGMA foreign_key_check').fetchall():
        raise RuntimeError('Invalid test database')
`, source, database], { stdio: 'pipe' })
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const connections = await db.$queryRaw<Array<{ name: string; file: string }>>`PRAGMA database_list`
  if (connections.find(c => c.name === 'main')?.file !== database)
    throw new Error('Prisma non usa il database temporaneo: annullato prima della pulizia dei dati.')
  // Remove personal/historical data ONLY inside the private disposable backup.
  await db.$transaction([
    db.tournamentSnapshot.deleteMany(), db.standing.deleteMany(), db.match.deleteMany(),
    db.enrollment.deleteMany(), db.tournament.deleteMany(), db.player.deleteMany(),
  ])
  mkdirSync(project)
  cpSync(path.join(root, 'src'), path.join(project, 'src'), { recursive: true })
  symlinkSync(path.join(root, 'node_modules'), path.join(project, 'node_modules'), 'dir')
  if (existsSync(path.join(root, 'public'))) symlinkSync(path.join(root, 'public'), path.join(project, 'public'), 'dir')
  for (const name of ['package.json', 'tsconfig.json', 'next.config.mjs', 'postcss.config.mjs', 'tailwind.config.ts'])
    copyFileSync(path.join(root, name), path.join(project, name))
  if (existsSync(path.join(root, 'next-env.d.ts')))
    copyFileSync(path.join(root, 'next-env.d.ts'), path.join(project, 'next-env.d.ts'))
  const reservation = net.createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = (reservation.address() as net.AddressInfo).port
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()))
  const baseUrl = `http://127.0.0.1:${port}`
  async function startServer() {
    server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'),
      'dev', project, '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: project, detached: true,
      env: { ...process.env, DATABASE_URL: databaseUrl, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout!.pipe(serverLog, { end: false })
    server.stderr!.pipe(serverLog, { end: false })
    let spawnError: Error | undefined
    server.once('error', error => { spawnError = error })
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Test server exited; see server.log')
      try {
        const response = await fetch(`${baseUrl}/tournaments/new`, { signal: AbortSignal.timeout(4000) })
        if (response.ok) return
      } catch { /* wait for compilation */ }
      await sleep(300)
    }
    throw new Error('Test server readiness timed out; see server.log')
  }
  await startServer()
  // Before the first UI write, prove that the application reads the disposable DB.
  // This also catches an outdated generated Prisma client with a hardcoded dev.db.
  const canary = `LEGACY_ISOLATION_${path.basename(workspace)}`
  const marker = await db.player.create({ data: { firstName: canary, lastName: canary } })
  try {
    const response = await fetch(`${baseUrl}/players`, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok || !(await response.text()).includes(canary))
      throw new Error('Isolamento DB non verificato: interrotto prima di qualsiasi scrittura UI.')
  } finally { await db.player.delete({ where: { id: marker.id } }) }
  checks.push({ tournament: '*', round: 0, layer: 'isolation-canary', status: 'PASS', differences: [] })
  console.log(`Replay UI su ${baseUrl}; database e build temporanei, server esistenti conservati.`)
  await replay({ baseUrl, db, checks, artifacts: logDirectory,
    restart: async () => { await stopServer(); await startServer() } })
}

main().catch(error => {
  checks.push({ tournament: '*', round: 0, layer: 'ui-runner', status: 'FAIL', differences: [], detail: String(error) })
  console.error(String(error))
}).finally(async () => {
  await cleanup()
  for (const [file, before] of Array.from(sourceFingerprints)) {
    const after = fingerprint(file)
    checks.push({ tournament: '*', round: 0, layer: `isolation/${path.basename(file)}`,
      status: before === after ? 'PASS' : 'FAIL', differences: before === after ? [] : [{
        tournament: '*', round: 0, player: '*', layer: 'isolation', field: 'logicalDatabaseSha256', expected: before, actual: after,
      }], detail: 'Impronta logica prima/dopo; modifiche concorrenti esterne vengono segnalate come differenze.' })
  }
  process.exitCode = saveReport('ui', checks, {
    isolation: 'SQLite read-only backup to disposable database; separate Next workspace; original databases untouched by runner',
    referencePolicy: 'Missing legacy exports remain BLOCKED even if internal consistency checks pass',
    coverage: { closedRounds: checks.filter(c => c.layer === 'closed-round/ui').length,
      playerRoundRows: checks.filter(c => c.layer === 'closed-round/ui').reduce((n, c) => n + (c.observed?.length ?? 0), 0) },
  })
})
