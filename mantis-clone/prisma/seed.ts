import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const players = [
    { firstName: 'Luca', lastName: 'Rossi', udeId: '100001' },
    { firstName: 'Marco', lastName: 'Bianchi', udeId: '100002' },
    { firstName: 'Anna', lastName: 'Verdi', udeId: '100003' },
    { firstName: 'Sofia', lastName: 'Neri', udeId: '100004' },
    { firstName: 'Giovanni', lastName: 'Gialli', udeId: '100005' },
    { firstName: 'Chiara', lastName: 'Blu', udeId: '100006' },
  ]

  for (const p of players) {
    await prisma.player.create({ data: p })
  }

  await prisma.tournament.create({
    data: {
      name: 'Torneo di prova Swiss',
      type: 'SWISS',
      format: 'CONSTRUCTED',
      gameId: 1,
      roundCount: 4,
    },
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
