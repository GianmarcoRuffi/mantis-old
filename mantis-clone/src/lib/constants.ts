export const MATCH_RESULT = {
  PENDING: 'PENDING',
  P1_WIN: 'P1_WIN',
  P2_WIN: 'P2_WIN',
  DRAW: 'DRAW',
  BYE: 'BYE',
}

export const MATCH_POINTS = {
  WIN: 3,
  DRAW: 1,
  LOSS: 0,
}

export const TOURN_TYPE = {
  SWISS: 'SWISS',
  SINGLE_ELIM: 'SINGLE_ELIM',
}

export const TOURN_FORMAT = {
  CONSTRUCTED: 'CONSTRUCTED',
  SEALED: 'SEALED',
  DRAFT: 'DRAFT',
}

export const TOURN_PROGRESS = {
  ACTIVE: 'ACTIVE',
  FINISHED: 'FINISHED',
}

export const GAMES = [
  { id: 1, name: 'Yu-Gi-Oh!' },
  { id: 2, name: 'VS System' },
]
