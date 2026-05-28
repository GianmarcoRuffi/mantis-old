'use server'

import { prisma } from './db'
import { generatePairings } from './swiss-pairing'
import { calculateStandings } from './standings'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { MATCH_RESULT, TOURN_PROGRESS } from './constants'

export async function enrollPlayer(formData: FormData) {
  const playerId = formData.get('playerId') as string
  const tournamentId = formData.get('tournamentId') as string

  await prisma.enrollment.create({
    data: {
      playerId,
      tournamentId,
    },
  })

  revalidatePath(`/tournaments/${tournamentId}`)
}

export async function dropPlayer(playerId: string, tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  })

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

  revalidatePath(`/tournaments/${tournamentId}`)
}

export async function startRound(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      enrollments: { where: { dropped: false } },
      matches: true,
    },
  })

  if (!tournament) return

  const nextRound = tournament.currentRound + 1
  const activeEnrollments = tournament.enrollments.map((e) => e.playerId)

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

  for (let i = 0; i < pairings.length; i++) {
    const p = pairings[i]
    await prisma.match.create({
      data: {
        tournamentId,
        roundNumber: nextRound,
        tableNumber: i + 1,
        player1Id: p.player1Id,
        player2Id: p.player2Id,
        isBye: p.isBye,
        result: p.isBye ? MATCH_RESULT.P1_WIN : MATCH_RESULT.PENDING,
        gamesWon1: p.isBye ? 2 : 0,
        gamesWon2: 0,
      },
    })
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { currentRound: nextRound },
  })

  revalidatePath(`/tournaments/${tournamentId}`)
}

export async function submitMatchResult(formData: FormData) {
  const matchId = formData.get('matchId') as string
  const result = formData.get('result') as string
  const gamesWon1 = parseInt(formData.get('gamesWon1') as string)
  const gamesWon2 = parseInt(formData.get('gamesWon2') as string)
  const tournamentId = formData.get('tournamentId') as string

  await prisma.match.update({
    where: { id: matchId },
    data: {
      result,
      gamesWon1,
      gamesWon2,
    },
  })

  revalidatePath(`/tournaments/${tournamentId}`)
}

export async function endRound(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      enrollments: true,
      matches: true,
    },
  })

  if (!tournament) return

  const allMatches = tournament.matches
  const enrollments = tournament.enrollments.map(e => e.playerId)
  
  const standings = calculateStandings(enrollments, allMatches)

  for (let i = 0; i < standings.length; i++) {
    const s = standings[i]
    await prisma.standing.upsert({
      where: {
        playerId_tournamentId_roundNumber: {
          playerId: s.playerId,
          tournamentId,
          roundNumber: tournament.currentRound,
        },
      },
      update: {
        matchPoints: s.matchPoints,
        omwPct: s.omwPct,
        gwPct: s.gwPct,
        ogwPct: s.ogwPct,
        gamesWon: s.gamesWon,
        gamesLost: s.gamesLost,
        gamesDrawn: s.gamesDrawn,
        rank: i + 1,
      },
      create: {
        playerId: s.playerId,
        tournamentId,
        roundNumber: tournament.currentRound,
        matchPoints: s.matchPoints,
        omwPct: s.omwPct,
        gwPct: s.gwPct,
        ogwPct: s.ogwPct,
        gamesWon: s.gamesWon,
        gamesLost: s.gamesLost,
        gamesDrawn: s.gamesDrawn,
        rank: i + 1,
      },
    })
  }

  revalidatePath(`/tournaments/${tournamentId}`)
}

export async function undoLastRound(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
  })

  if (!tournament || tournament.currentRound === 0) return

  await prisma.match.deleteMany({
    where: {
      tournamentId,
      roundNumber: tournament.currentRound,
    },
  })

  await prisma.standing.deleteMany({
    where: {
      tournamentId,
      roundNumber: tournament.currentRound,
    },
  })

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { currentRound: tournament.currentRound - 1 },
  })

  revalidatePath(`/tournaments/${tournamentId}`)
}

export async function closeTournament(tournamentId: string) {
  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { progress: TOURN_PROGRESS.FINISHED },
  })

  revalidatePath(`/tournaments/${tournamentId}`)
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
