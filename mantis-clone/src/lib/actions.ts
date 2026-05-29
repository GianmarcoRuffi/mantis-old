'use server'

import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  MATCH_RESULT,
  SNAPSHOT_REASON,
  TOURN_PROGRESS,
} from './constants'
import { prisma } from './db'
import {
  createTournamentSnapshot,
  findLatestTournamentSnapshot,
  findRoundStartSnapshot,
  restoreTournamentSnapshot,
} from './tournament-snapshots'
import { generatePairings } from './swiss-pairing'
import { calculateStandings } from './standings'

function tournamentPath(tournamentId: string) {
  return `/tournaments/${tournamentId}`
}

function getRoundMatches<T extends { roundNumber: number }>(matches: T[], roundNumber: number) {
  return matches.filter((match) => match.roundNumber === roundNumber)
}

function isRoundFinalized(
  standings: Array<{ roundNumber: number }>,
  roundNumber: number
) {
  return roundNumber > 0 && standings.some((standing) => standing.roundNumber === roundNumber)
}

function isPlaceholderMatch(match: {
  player1Id: string | null
  player2Id: string | null
  isBye: boolean
  result: string
}) {
  return Boolean(match.player1Id) && !match.player2Id && !match.isBye && match.result === MATCH_RESULT.PENDING
}

async function getTournamentState(tournamentId: string) {
  return prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      enrollments: true,
      matches: true,
      standings: true,
    },
  })
}

async function normalizeRoundTableNumbers(
  tx: Prisma.TransactionClient,
  tournamentId: string,
  roundNumber: number
) {
  const roundMatches = await tx.match.findMany({
    where: {
      tournamentId,
      roundNumber,
      OR: [{ player2Id: { not: null } }, { isBye: true }],
    },
    orderBy: [{ tableNumber: 'asc' }, { id: 'asc' }],
  })

  for (let index = 0; index < roundMatches.length; index += 1) {
    const match = roundMatches[index]

    if (match.tableNumber === index + 1) {
      continue
    }

    await tx.match.update({
      where: { id: match.id },
      data: { tableNumber: index + 1 },
    })
  }
}

async function rebuildStoredStandings(tx: Prisma.TransactionClient, tournamentId: string) {
  const tournament = await tx.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      enrollments: true,
      matches: true,
      standings: {
        select: { roundNumber: true },
      },
    },
  })

  if (!tournament) {
    return
  }

  const storedRounds = Array.from(
    new Set(tournament.standings.map((standing) => standing.roundNumber))
  ).sort(
    (left, right) => left - right
  )

  await tx.standing.deleteMany({
    where: { tournamentId },
  })

  if (storedRounds.length === 0) {
    return
  }

  const enrolledPlayerIds = tournament.enrollments.map((enrollment) => enrollment.playerId)

  for (const roundNumber of storedRounds) {
    const standings = calculateStandings(
      enrolledPlayerIds,
      tournament.matches.filter((match) => match.roundNumber <= roundNumber)
    )

    if (standings.length === 0) {
      continue
    }

    await tx.standing.createMany({
      data: standings.map((standing, index) => ({
        playerId: standing.playerId,
        tournamentId,
        roundNumber,
        matchPoints: standing.matchPoints,
        omwPct: standing.omwPct,
        gwPct: standing.gwPct,
        ogwPct: standing.ogwPct,
        gamesWon: standing.gamesWon,
        gamesLost: standing.gamesLost,
        gamesDrawn: standing.gamesDrawn,
        rank: index + 1,
      })),
    })
  }
}

export async function enrollPlayer(formData: FormData) {
  const playerId = formData.get('playerId') as string
  const tournamentId = formData.get('tournamentId') as string

  if (!playerId || !tournamentId) {
    return
  }

  const existingEnrollment = await prisma.enrollment.findUnique({
    where: {
      playerId_tournamentId: {
        playerId,
        tournamentId,
      },
    },
  })

  if (existingEnrollment) {
    revalidatePath(tournamentPath(tournamentId))
    return
  }

  await prisma.enrollment.create({
    data: {
      playerId,
      tournamentId,
    },
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function dropPlayer(playerId: string, tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  const enrollment = tournament.enrollments.find((item) => item.playerId === playerId)

  if (!enrollment || enrollment.dropped) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_DROP_PLAYER,
    tournament.currentRound || undefined
  )

  await prisma.enrollment.update({
    where: {
      playerId_tournamentId: {
        playerId,
        tournamentId,
      },
    },
    data: {
      dropped: true,
      droppedRound: tournament?.currentRound,
    },
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function restorePlayer(playerId: string, tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  const enrollment = tournament.enrollments.find((item) => item.playerId === playerId)

  if (!enrollment || !enrollment.dropped) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_RESTORE_PLAYER,
    tournament.currentRound || undefined
  )

  const missedRounds: number[] = []
  const firstMissedRound = (enrollment.droppedRound ?? 0) + 1

  for (let roundNumber = firstMissedRound; roundNumber <= tournament.currentRound; roundNumber += 1) {
    const alreadyTracked = tournament.matches.some(
      (match) =>
        match.roundNumber === roundNumber &&
        (match.player1Id === playerId || match.player2Id === playerId)
    )

    if (!alreadyTracked) {
      missedRounds.push(roundNumber)
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: {
        playerId_tournamentId: {
          playerId,
          tournamentId,
        },
      },
      data: {
        dropped: false,
        droppedRound: null,
      },
    })

    for (const roundNumber of missedRounds) {
      await tx.match.create({
        data: {
          tournamentId,
          roundNumber,
          tableNumber: null,
          player1Id: playerId,
          player2Id: null,
          result: MATCH_RESULT.P2_WIN,
          gamesWon1: 0,
          gamesWon2: 2,
          isBye: false,
          isManual: true,
        },
      })
    }

    await rebuildStoredStandings(tx, tournamentId)
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function startRound(tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  const currentRoundMatches = getRoundMatches(tournament.matches, tournament.currentRound)
  const currentRoundFinalized = isRoundFinalized(tournament.standings, tournament.currentRound)

  if (
    tournament.currentRound > 0 &&
    currentRoundMatches.length > 0 &&
    !currentRoundFinalized
  ) {
    return
  }

  if (tournament.currentRound >= tournament.roundCount) {
    return
  }

  const nextRound = tournament.currentRound + 1
  const activeEnrollments = tournament.enrollments
    .filter((enrollment) => !enrollment.dropped)
    .map((enrollment) => enrollment.playerId)

  if (activeEnrollments.length === 0) {
    return
  }

  await createTournamentSnapshot(tournamentId, SNAPSHOT_REASON.BEFORE_ROUND_START, nextRound)

  // Get history and match points for active players
  const playerStandings = await Promise.all(
    activeEnrollments.map(async (pid) => {
      const playerMatches = tournament.matches.filter(
        (m) => (m.player1Id === pid || m.player2Id === pid) && m.result !== MATCH_RESULT.PENDING
      )
      
      // Calculate current match points
      let pts = 0
      playerMatches.forEach(m => {
        if (m.isBye) { pts += 3 }
        else if (m.result === MATCH_RESULT.P1_WIN && m.player1Id === pid) pts += 3
        else if (m.result === MATCH_RESULT.P2_WIN && m.player2Id === pid) pts += 3
        else if (m.result === MATCH_RESULT.DRAW) pts += 1
      })

      return {
        playerId: pid,
        matchPoints: pts,
        omwPct: 0, // Simplified for pairing
        gwPct: 0,
        history: playerMatches.map((m) => (m.player1Id === pid ? m.player2Id : m.player1Id)).filter(Boolean) as string[],
      }
    })
  )

  const pairings = generatePairings(nextRound, playerStandings)

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < pairings.length; index += 1) {
      const pairing = pairings[index]

      await tx.match.create({
        data: {
          tournamentId,
          roundNumber: nextRound,
          tableNumber: index + 1,
          player1Id: pairing.player1Id,
          player2Id: pairing.player2Id,
          isBye: pairing.isBye,
          isManual: false,
          result: pairing.isBye ? MATCH_RESULT.P1_WIN : MATCH_RESULT.PENDING,
          gamesWon1: pairing.isBye ? 2 : 0,
          gamesWon2: 0,
        },
      })
    }

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: nextRound },
    })
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function submitMatchResult(formData: FormData) {
  const matchId = formData.get('matchId') as string
  const result = formData.get('result') as string
  const gamesWon1 = Number.parseInt((formData.get('gamesWon1') as string) || '0', 10)
  const gamesWon2 = Number.parseInt((formData.get('gamesWon2') as string) || '0', 10)
  const tournamentId = formData.get('tournamentId') as string

  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  const match = tournament.matches.find((item) => item.id === matchId)

  if (
    !match ||
    match.roundNumber !== tournament.currentRound ||
    isRoundFinalized(tournament.standings, tournament.currentRound) ||
    isPlaceholderMatch(match)
  ) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_UPDATE_MATCH_RESULT,
    tournament.currentRound
  )

  await prisma.match.update({
    where: { id: matchId },
    data: {
      result,
      gamesWon1,
      gamesWon2,
    },
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function endRound(tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (
    !tournament ||
    tournament.progress !== TOURN_PROGRESS.ACTIVE ||
    tournament.currentRound === 0
  ) {
    return
  }

  if (isRoundFinalized(tournament.standings, tournament.currentRound)) {
    return
  }

  const currentRoundMatches = getRoundMatches(tournament.matches, tournament.currentRound)

  if (currentRoundMatches.length === 0) {
    return
  }

  if (currentRoundMatches.some((match) => match.result === MATCH_RESULT.PENDING)) {
    return
  }

  const allMatches = tournament.matches
  const enrollments = tournament.enrollments.map((enrollment) => enrollment.playerId)
  
  const standings = calculateStandings(enrollments, allMatches)

  await prisma.$transaction(async (tx) => {
    await tx.standing.deleteMany({
      where: {
        tournamentId,
        roundNumber: tournament.currentRound,
      },
    })

    if (standings.length > 0) {
      await tx.standing.createMany({
        data: standings.map((standing, index) => ({
          playerId: standing.playerId,
          tournamentId,
          roundNumber: tournament.currentRound,
          matchPoints: standing.matchPoints,
          omwPct: standing.omwPct,
          gwPct: standing.gwPct,
          ogwPct: standing.ogwPct,
          gamesWon: standing.gamesWon,
          gamesLost: standing.gamesLost,
          gamesDrawn: standing.gamesDrawn,
          rank: index + 1,
        })),
      })
    }
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function undoLastRound(tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.currentRound === 0) {
    return
  }

  const roundStartSnapshot = await findRoundStartSnapshot(tournamentId, tournament.currentRound)

  if (roundStartSnapshot) {
    await restoreTournamentSnapshot(roundStartSnapshot.id)
    revalidatePath(tournamentPath(tournamentId))
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({
      where: {
        tournamentId,
        roundNumber: tournament.currentRound,
      },
    })

    await tx.standing.deleteMany({
      where: {
        tournamentId,
        roundNumber: tournament.currentRound,
      },
    })

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: tournament.currentRound - 1 },
    })
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function closeTournament(tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  const currentRoundMatches = getRoundMatches(tournament.matches, tournament.currentRound)
  const currentRoundFinalized = isRoundFinalized(tournament.standings, tournament.currentRound)

  if (
    tournament.currentRound > 0 &&
    currentRoundMatches.length > 0 &&
    !currentRoundFinalized
  ) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_CLOSE_TOURNAMENT,
    tournament.currentRound || undefined
  )

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { progress: TOURN_PROGRESS.FINISHED },
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function reopenTournament(tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.FINISHED) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_REOPEN_TOURNAMENT,
    tournament.currentRound || undefined
  )

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { progress: TOURN_PROGRESS.ACTIVE },
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function restoreLatestCheckpoint(tournamentId: string) {
  const snapshot = await findLatestTournamentSnapshot(tournamentId)

  if (!snapshot) {
    return
  }

  await restoreTournamentSnapshot(snapshot.id)
  revalidatePath(tournamentPath(tournamentId))
}

export async function repairCurrentRound(tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  const currentRoundMatches = getRoundMatches(tournament.matches, tournament.currentRound)

  if (
    tournament.currentRound === 0 ||
    currentRoundMatches.length === 0 ||
    isRoundFinalized(tournament.standings, tournament.currentRound)
  ) {
    return
  }

  const roundStartSnapshot = await findRoundStartSnapshot(tournamentId, tournament.currentRound)

  if (roundStartSnapshot) {
    await restoreTournamentSnapshot(roundStartSnapshot.id)
    await startRound(tournamentId)
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({
      where: {
        tournamentId,
        roundNumber: tournament.currentRound,
      },
    })

    await tx.tournament.update({
      where: { id: tournamentId },
      data: { currentRound: tournament.currentRound - 1 },
    })
  })

  await startRound(tournamentId)
}

export async function splitManualPairing(matchId: string, tournamentId: string) {
  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  if (isRoundFinalized(tournament.standings, tournament.currentRound)) {
    return
  }

  const match = tournament.matches.find(
    (item) => item.id === matchId && item.roundNumber === tournament.currentRound
  )

  if (!match) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_MANUAL_PAIRING_CHANGE,
    tournament.currentRound
  )

  await prisma.$transaction(async (tx) => {
    await tx.match.delete({ where: { id: matchId } })

    const playerIds = [match.player1Id, match.player2Id].filter(Boolean) as string[]

    for (const playerId of playerIds) {
      await tx.match.create({
        data: {
          tournamentId,
          roundNumber: tournament.currentRound,
          tableNumber: null,
          player1Id: playerId,
          player2Id: null,
          result: MATCH_RESULT.PENDING,
          gamesWon1: 0,
          gamesWon2: 0,
          isBye: false,
          isManual: true,
        },
      })
    }

    await normalizeRoundTableNumbers(tx, tournamentId, tournament.currentRound)
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function createManualPairing(formData: FormData) {
  const tournamentId = formData.get('tournamentId') as string
  const player1Id = formData.get('player1Id') as string
  const player2Id = formData.get('player2Id') as string

  if (!tournamentId || !player1Id || !player2Id || player1Id === player2Id) {
    return
  }

  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  if (isRoundFinalized(tournament.standings, tournament.currentRound)) {
    return
  }

  const placeholders = getRoundMatches(tournament.matches, tournament.currentRound).filter(isPlaceholderMatch)
  const player1Placeholder = placeholders.find((match) => match.player1Id === player1Id)
  const player2Placeholder = placeholders.find((match) => match.player1Id === player2Id)

  if (!player1Placeholder || !player2Placeholder) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_MANUAL_PAIRING_CHANGE,
    tournament.currentRound
  )

  await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({
      where: {
        id: {
          in: [player1Placeholder.id, player2Placeholder.id],
        },
      },
    })

    await tx.match.create({
      data: {
        tournamentId,
        roundNumber: tournament.currentRound,
        tableNumber: null,
        player1Id,
        player2Id,
        result: MATCH_RESULT.PENDING,
        gamesWon1: 0,
        gamesWon2: 0,
        isBye: false,
        isManual: true,
      },
    })

    await normalizeRoundTableNumbers(tx, tournamentId, tournament.currentRound)
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function assignManualBye(formData: FormData) {
  const tournamentId = formData.get('tournamentId') as string
  const playerId = formData.get('playerId') as string

  if (!tournamentId || !playerId) {
    return
  }

  const tournament = await getTournamentState(tournamentId)

  if (!tournament || tournament.progress !== TOURN_PROGRESS.ACTIVE) {
    return
  }

  if (isRoundFinalized(tournament.standings, tournament.currentRound)) {
    return
  }

  const currentRoundMatches = getRoundMatches(tournament.matches, tournament.currentRound)
  const placeholder = currentRoundMatches.find(
    (match) => isPlaceholderMatch(match) && match.player1Id === playerId
  )
  const existingBye = currentRoundMatches.find((match) => match.isBye)

  if (!placeholder || existingBye) {
    return
  }

  await createTournamentSnapshot(
    tournamentId,
    SNAPSHOT_REASON.BEFORE_MANUAL_PAIRING_CHANGE,
    tournament.currentRound
  )

  await prisma.$transaction(async (tx) => {
    await tx.match.update({
      where: { id: placeholder.id },
      data: {
        tableNumber: null,
        result: MATCH_RESULT.P1_WIN,
        gamesWon1: 2,
        gamesWon2: 0,
        isBye: true,
        isManual: true,
      },
    })

    await normalizeRoundTableNumbers(tx, tournamentId, tournament.currentRound)
  })

  revalidatePath(tournamentPath(tournamentId))
}

export async function createPlayer(formData: FormData) {
  const firstName = formData.get('firstName') as string
  const lastName = formData.get('lastName') as string
  const udeId = formData.get('udeId') as string

  await prisma.player.create({
    data: { firstName, lastName, udeId },
  })

  redirect('/players')
}

export async function createTournament(formData: FormData) {
  const name = formData.get('name') as string
  const type = formData.get('type') as string
  const format = formData.get('format') as string
  const gameId = parseInt(formData.get('gameId') as string)
  const roundCount = parseInt(formData.get('roundCount') as string)

  const t = await prisma.tournament.create({
    data: { name, type, format, gameId, roundCount },
  })

  redirect('/tournaments/' + t.id)
}
