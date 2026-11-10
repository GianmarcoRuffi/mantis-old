import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import type { PrismaClient } from '@prisma/client'

const execFileAsync = promisify(execFile)

export type ImportedPlayer = {
  firstName: string
  lastName: string
  udeId: string | null
}

type RawPlayer = {
  PlayerID: string
  NameFirst: string
  NameLast: string
}

function decodeEscapedValue(value: string) {
  return value
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
}

function resolveMdbExportBinary(repoRoot: string) {
  const localBinary = path.resolve(repoRoot, '../.mdbtools-local/extracted/usr/bin/mdb-export')
  return existsSync(localBinary) ? localBinary : 'mdb-export'
}

function resolveLibraryPath(repoRoot: string) {
  const libraryPaths = [
    path.resolve(repoRoot, '../.mdbtools-local/extracted/usr/lib/x86_64-linux-gnu'),
    path.resolve(repoRoot, '../.mdbtools-local/extracted/lib/x86_64-linux-gnu'),
  ].filter((candidate) => existsSync(candidate))

  if (libraryPaths.length === 0) {
    return process.env.LD_LIBRARY_PATH
  }

  return [...libraryPaths, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':')
}

function playerIdentityKey(player: ImportedPlayer) {
  return player.udeId
    ? `ude:${player.udeId}`
    : `name:${player.lastName.toLowerCase()}|${player.firstName.toLowerCase()}`
}

export function resolveDefaultMdbPath(repoRoot = process.cwd()) {
  return path.resolve(repoRoot, '../Mantis/Mantis.mdb')
}

async function exportPlayersFromMdb(mdbPath: string, repoRoot: string) {
  const mdbExportBinary = resolveMdbExportBinary(repoRoot)
  const ldLibraryPath = resolveLibraryPath(repoRoot)

  const { stdout } = await execFileAsync(
    mdbExportBinary,
    ['-d', '\t', '-Q', '-e', mdbPath, 'Player'],
    {
      env: {
        ...process.env,
        ...(ldLibraryPath ? { LD_LIBRARY_PATH: ldLibraryPath } : {}),
      },
      maxBuffer: 20 * 1024 * 1024,
    }
  )

  const [headerLine, ...lines] = stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)

  if (!headerLine) {
    return [] as RawPlayer[]
  }

  const headers = headerLine.split('\t')

  return lines.map((line) => {
    const columns = line.split('\t').map(decodeEscapedValue)
    const player = {} as Record<string, string>

    headers.forEach((header, index) => {
      player[header] = columns[index] ?? ''
    })

    return player as unknown as RawPlayer
  })
}

export async function loadPlayersFromMdb(mdbPath: string, repoRoot = process.cwd()) {
  const rawPlayers = await exportPlayersFromMdb(mdbPath, repoRoot)
  const normalizedPlayers = rawPlayers
    .map((player) => ({
      udeId: player.PlayerID?.trim() || null,
      firstName: player.NameFirst?.trim() || '',
      lastName: player.NameLast?.trim() || '',
    }))
    .filter((player) => player.firstName && player.lastName)

  const sourceSeen = new Set<string>()

  return normalizedPlayers.filter((player) => {
    const key = playerIdentityKey(player)

    if (sourceSeen.has(key)) {
      return false
    }

    sourceSeen.add(key)
    return true
  })
}

export async function insertMissingPlayers(prisma: PrismaClient, players: ImportedPlayer[]) {
  const existingPlayers = await prisma.player.findMany({
    select: {
      udeId: true,
      firstName: true,
      lastName: true,
    },
  })

  const existingKeys = new Set(existingPlayers.map(playerIdentityKey))
  const playersToInsert = players.filter((player) => !existingKeys.has(playerIdentityKey(player)))

  if (playersToInsert.length > 0) {
    await prisma.player.createMany({
      data: playersToInsert,
    })
  }

  return {
    insertedCount: playersToInsert.length,
    skippedCount: players.length - playersToInsert.length,
  }
}