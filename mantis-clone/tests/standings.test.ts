import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateStandings } from '../src/lib/standings'
import { MATCH_RESULT } from '../src/lib/constants'

function win(winner: string, loser: string, roundNumber: number) {
  return {
    player1Id: winner,
    player2Id: loser,
    roundNumber,
    result: MATCH_RESULT.P1_WIN,
    gamesWon1: 2,
    gamesWon2: 0,
    isBye: false,
  }
}

test('calcola T1, T2 e T3 su tre turni con vittorie e sconfitte', () => {
  const standings = calculateStandings(['A', 'B', 'C', 'D'], [
    win('A', 'B', 1),
    win('C', 'D', 1),
    win('C', 'A', 2),
    win('B', 'D', 2),
    win('A', 'D', 3),
    win('C', 'B', 3),
  ])

  // Bilanci V-S: A=+1, B=-1, C=+3, D=-3.
  const expected = {
    A: { t1: -1, t2: 1, t3: 4 },
    B: { t1: 1, t2: -1, t3: 10 },
    C: { t1: -3, t2: 3, t3: 0 },
    D: { t1: 3, t2: -3, t3: 14 },
  }

  for (const standing of standings) {
    assert.deepEqual(
      { t1: standing.tiebreaker1, t2: standing.tiebreaker2, t3: standing.tiebreaker3 },
      expected[standing.playerId as keyof typeof expected],
      standing.playerId,
    )
  }
})

test('limita a -3 il contributo di ogni avversario e propaga il limite nei T2', () => {
  const standings = calculateStandings(['A', 'B', 'C', 'D', 'L'], [
    win('A', 'L', 1),
    win('B', 'L', 2),
    win('C', 'L', 3),
    win('D', 'L', 4),
  ])

  // L ha 0 vittorie e 4 sconfitte: il suo contributo al T1 viene limitato a -3.
  for (const standing of standings.filter((standing) => standing.playerId !== 'L')) {
    assert.equal(standing.tiebreaker1, -3)
    assert.equal(standing.tiebreaker2, 4)
  }

  const loser = standings.find((standing) => standing.playerId === 'L')!
  assert.equal(loser.tiebreaker1, 4)
  assert.equal(loser.tiebreaker2, -12)
  assert.equal(loser.tiebreaker3, 1 + 4 + 9 + 16)
})

test('pareggi e incontri in attesa non contano come vittorie o sconfitte', () => {
  const standings = calculateStandings(['A', 'B'], [
    { ...win('A', 'B', 1), result: MATCH_RESULT.DRAW, gamesWon1: 1, gamesWon2: 1 },
    { ...win('A', 'B', 2), result: MATCH_RESULT.PENDING },
  ])

  for (const standing of standings) {
    assert.equal(standing.tiebreaker1, 0)
    assert.equal(standing.tiebreaker2, 0)
    assert.equal(standing.tiebreaker3, 0)
  }
})
