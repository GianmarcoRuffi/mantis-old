import { MATCH_RESULT, MATCH_POINTS } from './constants'

interface MatchData {
  player1Id: string | null
  player2Id: string | null
  result: string
  gamesWon1: number
  gamesWon2: number
  isBye: boolean
  roundNumber: number
}

export function calculateStandings(enrollments: string[], matches: MatchData[]) {
  const players = enrollments.reduce((acc, pid) => {
    acc[pid] = {
      playerId: pid,
      matchPoints: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDrawn: 0,
      matchesPlayed: 0,
      opponents: [] as string[],
      results: [] as { opponentId: string | null; points: number; gWon: number; gLost: number }[],
    }
    return acc
  }, {} as Record<string, any>)

  matches.forEach((m) => {
    if (m.result === MATCH_RESULT.PENDING) return

    const { player1Id, player2Id, result, gamesWon1, gamesWon2, isBye } = m

    if (isBye && player1Id) {
      players[player1Id].matchPoints += MATCH_POINTS.WIN
      players[player1Id].gamesWon += 2
      players[player1Id].results.push({ opponentId: null, points: MATCH_POINTS.WIN, gWon: 2, gLost: 0 })
      return
    }

    if (player1Id && !player2Id) {
      players[player1Id].matchesPlayed++
      players[player1Id].gamesWon += gamesWon1
      players[player1Id].gamesLost += gamesWon2
      players[player1Id].results.push({
        opponentId: null,
        points: MATCH_POINTS.LOSS,
        gWon: gamesWon1,
        gLost: gamesWon2,
      })
      return
    }

    if (!player1Id || !player2Id) return

    players[player1Id].opponents.push(player2Id)
    players[player2Id].opponents.push(player1Id)
    players[player1Id].matchesPlayed++
    players[player2Id].matchesPlayed++

    if (result === MATCH_RESULT.P1_WIN) {
      players[player1Id].matchPoints += MATCH_POINTS.WIN
      players[player1Id].results.push({ opponentId: player2Id, points: MATCH_POINTS.WIN, gWon: gamesWon1, gLost: gamesWon2 })
      players[player2Id].results.push({ opponentId: player1Id, points: MATCH_POINTS.LOSS, gWon: gamesWon2, gLost: gamesWon1 })
    } else if (result === MATCH_RESULT.P2_WIN) {
      players[player2Id].matchPoints += MATCH_POINTS.WIN
      players[player1Id].results.push({ opponentId: player2Id, points: MATCH_POINTS.LOSS, gWon: gamesWon1, gLost: gamesWon2 })
      players[player2Id].results.push({ opponentId: player1Id, points: MATCH_POINTS.WIN, gWon: gamesWon2, gLost: gamesWon1 })
    } else if (result === MATCH_RESULT.DRAW) {
      players[player1Id].matchPoints += MATCH_POINTS.DRAW
      players[player2Id].matchPoints += MATCH_POINTS.DRAW
      players[player1Id].results.push({ opponentId: player2Id, points: MATCH_POINTS.DRAW, gWon: gamesWon1, gLost: gamesWon2 })
      players[player2Id].results.push({ opponentId: player1Id, points: MATCH_POINTS.DRAW, gWon: gamesWon2, gLost: gamesWon1 })
    }

    players[player1Id].gamesWon += gamesWon1
    players[player1Id].gamesLost += gamesWon2
    players[player2Id].gamesWon += gamesWon2
    players[player2Id].gamesLost += gamesWon1
  })

  // Calculate percentages
  const calcMWP = (pid: string) => {
    const p = players[pid]
    if (p.matchesPlayed === 0) return 0
    return Math.max(0.33, p.matchPoints / (p.matchesPlayed * 3))
  }

  const calcGWP = (pid: string) => {
    const p = players[pid]
    const total = p.gamesWon + p.gamesLost
    if (total === 0) return 0
    return p.gamesWon / total
  }

  const standingList = Object.values(players).map((p: any) => {
    const mwp = calcMWP(p.playerId)
    const gwp = calcGWP(p.playerId)

    return {
      ...p,
      mwp,
      gwp,
    }
  })

  const finalStandings = standingList.map((p: any) => {
    const omwPct = p.opponents.length > 0 
      ? p.opponents.reduce((sum: number, oppId: string) => sum + calcMWP(oppId), 0) / p.opponents.length 
      : 0
    const ogwPct = p.opponents.length > 0 
      ? p.opponents.reduce((sum: number, oppId: string) => sum + calcGWP(oppId), 0) / p.opponents.length 
      : 0

    return {
      playerId: p.playerId,
      matchPoints: p.matchPoints,
      omwPct,
      gwPct: p.gwp,
      ogwPct,
      gamesWon: p.gamesWon,
      gamesLost: p.gamesLost,
      gamesDrawn: p.gamesDrawn
    }
  })

  return finalStandings.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints
    if (b.omwPct !== a.omwPct) return b.omwPct - a.omwPct
    if (b.gwPct !== a.gwPct) return b.gwPct - a.gwPct
    return b.ogwPct - a.ogwPct
  })
}
