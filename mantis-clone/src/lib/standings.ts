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

type PlayerAccumulator = {
  playerId: string
  matchPoints: number
  gamesWon: number
  gamesLost: number
  gamesDrawn: number
  wins: number
  losses: number
  opponents: Array<string | null>
  history: string[]
  lostRounds: number[]
}

export type CalculatedStanding = {
  playerId: string
  matchPoints: number
  tiebreaker1: number
  tiebreaker2: number
  tiebreaker3: number
  gamesWon: number
  gamesLost: number
  gamesDrawn: number
  history: string[]
}

export function compareCalculatedStandings(a: CalculatedStanding, b: CalculatedStanding) {
  if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints
  if (b.tiebreaker1 !== a.tiebreaker1) return b.tiebreaker1 - a.tiebreaker1
  if (b.tiebreaker2 !== a.tiebreaker2) return b.tiebreaker2 - a.tiebreaker2
  return b.tiebreaker3 - a.tiebreaker3
}

export function calculateStandings(enrollments: string[], matches: MatchData[]) {
  const players = enrollments.reduce((acc, playerId) => {
    acc[playerId] = {
      playerId,
      matchPoints: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDrawn: 0,
      wins: 0,
      losses: 0,
      opponents: [],
      history: [],
      lostRounds: [],
    }

    return acc
  }, {} as Record<string, PlayerAccumulator>)

  matches.forEach((match) => {
    if (match.result === MATCH_RESULT.PENDING) {
      return
    }

    const { player1Id, player2Id, result, gamesWon1, gamesWon2, isBye, roundNumber } = match

    if (isBye && player1Id && players[player1Id]) {
      players[player1Id].matchPoints += MATCH_POINTS.WIN
      players[player1Id].gamesWon += 2
      players[player1Id].wins += 1
      return
    }

    if (player1Id && !player2Id && players[player1Id]) {
      players[player1Id].gamesWon += gamesWon1
      players[player1Id].gamesLost += gamesWon2

      if (result === MATCH_RESULT.P1_WIN) {
        players[player1Id].matchPoints += MATCH_POINTS.WIN
        players[player1Id].wins += 1
      } else if (result === MATCH_RESULT.P2_WIN) {
        players[player1Id].losses += 1
        players[player1Id].lostRounds.push(roundNumber)
      } else if (result === MATCH_RESULT.DRAW) {
        players[player1Id].matchPoints += MATCH_POINTS.DRAW
      }

      return
    }

    if (!player1Id || !player2Id || !players[player1Id] || !players[player2Id]) {
      return
    }

    players[player1Id].opponents.push(player2Id)
    players[player1Id].history.push(player2Id)
    players[player2Id].opponents.push(player1Id)
    players[player2Id].history.push(player1Id)

    players[player1Id].gamesWon += gamesWon1
    players[player1Id].gamesLost += gamesWon2
    players[player2Id].gamesWon += gamesWon2
    players[player2Id].gamesLost += gamesWon1

    if (result === MATCH_RESULT.P1_WIN) {
      players[player1Id].matchPoints += MATCH_POINTS.WIN
      players[player1Id].wins += 1
      players[player2Id].losses += 1
      players[player2Id].lostRounds.push(roundNumber)
    } else if (result === MATCH_RESULT.P2_WIN) {
      players[player2Id].matchPoints += MATCH_POINTS.WIN
      players[player2Id].wins += 1
      players[player1Id].losses += 1
      players[player1Id].lostRounds.push(roundNumber)
    } else if (result === MATCH_RESULT.DRAW) {
      players[player1Id].matchPoints += MATCH_POINTS.DRAW
      players[player2Id].matchPoints += MATCH_POINTS.DRAW
    }
  })

  const tiebreaker1ByPlayer = Object.values(players).reduce((acc, player) => {
    acc[player.playerId] = player.opponents.reduce((sum, opponentId) => {
      if (!opponentId || !players[opponentId]) {
        return sum
      }

      const opponentContribution = Math.max(-3, players[opponentId].wins - players[opponentId].losses)
      return sum + opponentContribution
    }, 0)

    return acc
  }, {} as Record<string, number>)

  const finalStandings: CalculatedStanding[] = Object.values(players).map((player) => ({
    playerId: player.playerId,
    matchPoints: player.matchPoints,
    tiebreaker1: tiebreaker1ByPlayer[player.playerId] ?? 0,
    tiebreaker2: player.opponents.reduce((sum, opponentId) => {
      if (!opponentId) {
        return sum
      }

      return sum + (tiebreaker1ByPlayer[opponentId] ?? 0)
    }, 0),
    tiebreaker3: player.lostRounds.reduce((sum, roundNumber) => sum + roundNumber * roundNumber, 0),
    gamesWon: player.gamesWon,
    gamesLost: player.gamesLost,
    gamesDrawn: player.gamesDrawn,
    history: player.history,
  }))

  return finalStandings.sort(compareCalculatedStandings)
}
