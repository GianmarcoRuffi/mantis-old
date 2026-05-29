import { prisma } from './db'

type TournamentSnapshotPayload = {
  tournament: {
    currentRound: number
    progress: string
  }
  enrollments: Array<{
    id: string
    playerId: string
    tournamentId: string
    dropped: boolean
    droppedRound: number | null
  }>
  matches: Array<{
    id: string
    tournamentId: string
    roundNumber: number
    tableNumber: number | null
    player1Id: string | null
    player2Id: string | null
    result: string
    gamesWon1: number
    gamesWon2: number
    isBye: boolean
    isManual: boolean
  }>
  standings: Array<{
    id: string
    playerId: string
    tournamentId: string
    roundNumber: number
    matchPoints: number
    omwPct: number
    gwPct: number
    ogwPct: number
    gamesWon: number
    gamesLost: number
    gamesDrawn: number
    rank: number | null
  }>
}

function parseSnapshotPayload(data: string): TournamentSnapshotPayload {
  return JSON.parse(data) as TournamentSnapshotPayload
}

export async function createTournamentSnapshot(
  tournamentId: string,
  reason: string,
  roundNumber?: number
) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      enrollments: {
        orderBy: { id: 'asc' },
      },
      matches: {
        orderBy: [
          { roundNumber: 'asc' },
          { tableNumber: 'asc' },
          { id: 'asc' },
        ],
      },
      standings: {
        orderBy: [
          { roundNumber: 'asc' },
          { rank: 'asc' },
          { id: 'asc' },
        ],
      },
    },
  })

  if (!tournament) {
    return null
  }

  const payload: TournamentSnapshotPayload = {
    tournament: {
      currentRound: tournament.currentRound,
      progress: tournament.progress,
    },
    enrollments: tournament.enrollments.map((enrollment) => ({
      id: enrollment.id,
      playerId: enrollment.playerId,
      tournamentId: enrollment.tournamentId,
      dropped: enrollment.dropped,
      droppedRound: enrollment.droppedRound,
    })),
    matches: tournament.matches.map((match) => ({
      id: match.id,
      tournamentId: match.tournamentId,
      roundNumber: match.roundNumber,
      tableNumber: match.tableNumber,
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      result: match.result,
      gamesWon1: match.gamesWon1,
      gamesWon2: match.gamesWon2,
      isBye: match.isBye,
      isManual: match.isManual,
    })),
    standings: tournament.standings.map((standing) => ({
      id: standing.id,
      playerId: standing.playerId,
      tournamentId: standing.tournamentId,
      roundNumber: standing.roundNumber,
      matchPoints: standing.matchPoints,
      omwPct: standing.omwPct,
      gwPct: standing.gwPct,
      ogwPct: standing.ogwPct,
      gamesWon: standing.gamesWon,
      gamesLost: standing.gamesLost,
      gamesDrawn: standing.gamesDrawn,
      rank: standing.rank,
    })),
  }

  return prisma.tournamentSnapshot.create({
    data: {
      tournamentId,
      reason,
      roundNumber,
      data: JSON.stringify(payload),
    },
  })
}

export async function findLatestTournamentSnapshot(tournamentId: string) {
  return prisma.tournamentSnapshot.findFirst({
    where: { tournamentId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function findRoundStartSnapshot(tournamentId: string, roundNumber: number) {
  return prisma.tournamentSnapshot.findFirst({
    where: {
      tournamentId,
      reason: 'BEFORE_ROUND_START',
      roundNumber,
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function restoreTournamentSnapshot(snapshotId: string) {
  const snapshot = await prisma.tournamentSnapshot.findUnique({
    where: { id: snapshotId },
  })

  if (!snapshot) {
    return null
  }

  const payload = parseSnapshotPayload(snapshot.data)

  await prisma.$transaction(async (tx) => {
    await tx.standing.deleteMany({
      where: { tournamentId: snapshot.tournamentId },
    })

    await tx.match.deleteMany({
      where: { tournamentId: snapshot.tournamentId },
    })

    await tx.enrollment.deleteMany({
      where: { tournamentId: snapshot.tournamentId },
    })

    await tx.tournament.update({
      where: { id: snapshot.tournamentId },
      data: {
        currentRound: payload.tournament.currentRound,
        progress: payload.tournament.progress,
      },
    })

    if (payload.enrollments.length > 0) {
      await tx.enrollment.createMany({
        data: payload.enrollments,
      })
    }

    if (payload.matches.length > 0) {
      await tx.match.createMany({
        data: payload.matches,
      })
    }

    if (payload.standings.length > 0) {
      await tx.standing.createMany({
        data: payload.standings,
      })
    }
  })

  return snapshot
}