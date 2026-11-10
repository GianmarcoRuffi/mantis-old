import { existsSync } from 'node:fs'

import { PrismaClient } from '@prisma/client'
import { insertMissingPlayers, loadPlayersFromMdb, resolveDefaultMdbPath } from './mantis-player-import'

const prisma = new PrismaClient()

async function main() {
  const mdbPath = process.argv[2] ?? resolveDefaultMdbPath()

  if (!existsSync(mdbPath)) {
    throw new Error(`MDB non trovato: ${mdbPath}`)
  }

  const players = await loadPlayersFromMdb(mdbPath)
  const { insertedCount, skippedCount } = await insertMissingPlayers(prisma, players)

  console.log(
    `Import completato: ${insertedCount} giocatori inseriti, ${skippedCount} gia presenti.`
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })