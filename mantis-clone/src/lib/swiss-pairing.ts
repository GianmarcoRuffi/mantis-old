import { MATCH_RESULT } from './constants'

interface PlayerStanding {
  playerId: string
  matchPoints: number
  omwPct: number
  gwPct: number
  history: string[] // List of playerIds played against
}

export function generatePairings(
  roundNumber: number,
  standings: PlayerStanding[]
) {
  // Sort players by matchPoints DESC, then omwPct DESC, then gwPct DESC
  const sortedPlayers = [...standings].sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints
    if (b.omwPct !== a.omwPct) return b.omwPct - a.omwPct
    return b.gwPct - a.gwPct
  })

  const pairings: { player1Id: string | null; player2Id: string | null; isBye: boolean }[] = []
  const pairedIds = new Set<string>()

  const playersToPair = [...sortedPlayers]

  // Handle Bye if odd number of players
  if (playersToPair.length % 2 !== 0) {
    // Find candidate for bye: last player who hasn't had a bye yet (simplified: just last player)
    // In a real swiss, it should be someone who hasn't had a bye.
    // For simplicity, we take the last player.
    const byePlayer = playersToPair.pop()!
    pairings.push({ player1Id: byePlayer.playerId, player2Id: null, isBye: true })
    pairedIds.add(byePlayer.playerId)
  }

  while (playersToPair.length > 0) {
    const p1 = playersToPair.shift()!
    let found = false

    for (let i = 0; i < playersToPair.length; i++) {
      const p2 = playersToPair[i]
      // Anti-repairing: haven't played before
      if (!p1.history.includes(p2.playerId)) {
        pairings.push({ player1Id: p1.playerId, player2Id: p2.playerId, isBye: false })
        playersToPair.splice(i, 1)
        found = true
        break
      }
    }

    if (!found && playersToPair.length > 0) {
      // If no valid pairing found, just pair with the next available (violates anti-repairing but prevents infinite loop)
      const p2 = playersToPair.shift()!
      pairings.push({ player1Id: p1.playerId, player2Id: p2.playerId, isBye: false })
    }
  }

  return pairings
}
