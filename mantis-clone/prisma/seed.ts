import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'

import { loadPlayersFromMdb, resolveDefaultMdbPath } from './mantis-player-import'

const prisma = new PrismaClient()

async function resetDatabase() {
  await prisma.standing.deleteMany()
  await prisma.match.deleteMany()
  await prisma.tournamentSnapshot.deleteMany()
  await prisma.enrollment.deleteMany()
  await prisma.tournament.deleteMany()
  await prisma.player.deleteMany()
}

async function main() {
  const mdbPath = process.env.MANTIS_MDB_PATH ?? resolveDefaultMdbPath()

  if (!existsSync(mdbPath)) {
    throw new Error(`MDB non trovato: ${mdbPath}`)
  }

  await resetDatabase()

  const players = await loadPlayersFromMdb(mdbPath)

  if (players.length > 0) {
    await prisma.player.createMany({
      data: players,
    })
  }

  console.log(`Seed completato: ${players.length} giocatori importati da ${mdbPath}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
