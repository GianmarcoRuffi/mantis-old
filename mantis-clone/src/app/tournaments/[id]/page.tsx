import Link from 'next/link'

import { prisma } from '@/lib/db'
import {
  assignManualBye,
  cancelManualPairing,
  closeTournament,
  createAndEnrollPlayer,
  createManualPairing,
  deleteTournament,
  dropPlayer,
  endRound,
  enrollPlayer,
  repairCurrentRound,
  removeEnrollment,
  reopenTournament,
  restoreLatestCheckpoint,
  restorePlayer,
  splitManualPairing,
  startRound,
  submitMatchResult,
  undoLastRound,
} from '@/lib/actions'
import { MATCH_RESULT, TOURN_PROGRESS } from '@/lib/constants'
import { calculateStandings } from '@/lib/standings'
import { ConfirmSubmitButton } from '@/components/confirm-submit-button'
import { MatchResultForm } from '@/components/match-result-form'

function matchResultLabel(match: {
  isBye: boolean
  result: string
  player1?: { firstName: string; lastName: string } | null
  player2?: { firstName: string; lastName: string } | null
}) {
  if (match.isBye) {
    return 'BYE'
  }

  if (match.result === MATCH_RESULT.P1_WIN && match.player1) {
    return `Vince ${match.player1.lastName} ${match.player1.firstName}`
  }

  if (match.result === MATCH_RESULT.P2_WIN && match.player2) {
    return `Vince ${match.player2.lastName} ${match.player2.firstName}`
  }

  if (match.result === MATCH_RESULT.DRAW) {
    return 'Risultato storico non supportato'
  }

  return 'In attesa risultato'
}

function isPlaceholderMatch(match: {
  player1Id: string | null
  player2Id: string | null
  isBye: boolean
  result: string
}) {
  return Boolean(match.player1Id) && !match.player2Id && !match.isBye && match.result === MATCH_RESULT.PENDING
}

function tournamentDetailPath(
  tournamentId: string,
  options?: {
    round?: number
    status?: string
    manualPairing?: boolean
    sourceMatchId?: string
  }
) {
  const params = new URLSearchParams()

  if (options?.round && options.round > 0) {
    params.set('round', String(options.round))
  }

  if (options?.status) {
    params.set('status', options.status)
  }

  if (options?.manualPairing) {
    params.set('manualPairing', '1')
  }

  if (options?.sourceMatchId) {
    params.set('sourceMatchId', options.sourceMatchId)
  }

  const query = params.toString()
  return query ? `/tournaments/${tournamentId}?${query}` : `/tournaments/${tournamentId}`
}

function tournamentStatusMessage(status?: string) {
  switch (status) {
    case 'player-already-enrolled':
      return {
        className: 'border-amber-200 bg-amber-50 text-amber-800',
        text: 'Il giocatore selezionato risulta gia iscritto al torneo.',
      }
    case 'player-enrolled':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'Giocatore iscritto correttamente al torneo.',
      }
    case 'player-created-enrolled':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'Nuovo giocatore creato e iscritto correttamente.',
      }
    case 'enrollment-removed':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'Iscrizione rimossa dal torneo.',
      }
    case 'player-dropped':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'Drop del giocatore registrato.',
      }
    case 'player-restored':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'Giocatore ripristinato nel torneo.',
      }
    case 'match-updated':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'Risultato del match aggiornato.',
      }
    case 'manual-pairing-split':
      return {
        className: 'border-indigo-200 bg-indigo-50 text-indigo-800',
        text: 'Pool manuale aperto. Completa l\'abbinamento dal popup.',
      }
    case 'manual-pairing-created':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'Abbinamento manuale creato correttamente.',
      }
    case 'manual-bye-assigned':
      return {
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        text: 'BYE manuale assegnato correttamente.',
      }
    case 'manual-pairing-cancelled':
      return {
        className: 'border-amber-200 bg-amber-50 text-amber-800',
        text: 'Procedura di abbinamento manuale annullata.',
      }
    default:
      return null
  }
}

function formatTiebreaker(value: number) {
  if (value > 0) {
    return `+${value}`
  }

  return String(value)
}

function snapshotReasonLabel(reason: string) {
  switch (reason) {
    case 'BEFORE_CLOSE_TOURNAMENT':
      return 'Prima della chiusura torneo'
    case 'BEFORE_DROP_PLAYER':
      return 'Prima del drop giocatore'
    case 'BEFORE_MANUAL_PAIRING_CHANGE':
      return 'Prima di una modifica manuale agli abbinamenti'
    case 'BEFORE_REOPEN_TOURNAMENT':
      return 'Prima della riapertura torneo'
    case 'BEFORE_RESTORE_PLAYER':
      return 'Prima del ripristino di un giocatore'
    case 'BEFORE_ROUND_START':
      return 'Prima della generazione del round'
    case 'BEFORE_UPDATE_MATCH_RESULT':
      return 'Prima di una modifica risultato'
    default:
      return reason
  }
}

export default async function TournamentDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams?: {
    round?: string
    status?: string
    manualPairing?: string
    sourceMatchId?: string
  }
}) {
  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      enrollments: { include: { player: true } },
      matches: {
        include: { player1: true, player2: true },
        orderBy: [{ roundNumber: 'asc' }, { tableNumber: 'asc' }, { id: 'asc' }],
      },
      snapshots: {
        orderBy: { createdAt: 'desc' },
        take: 8,
      },
      standings: {
        include: { player: true },
        orderBy: [{ roundNumber: 'desc' }, { rank: 'asc' }, { id: 'asc' }],
      },
    },
  })

  if (!t) return <div>Torneo non trovato</div>

  const allPlayers = await prisma.player.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  const enrolledPlayerIds = t.enrollments.map((enrollment) => enrollment.playerId)
  const availablePlayers = allPlayers.filter((player) => !enrolledPlayerIds.includes(player.id))

  const availableRounds = Array.from(
    new Set(
      [
        ...t.matches.map((match) => match.roundNumber),
        ...t.standings.map((standing) => standing.roundNumber),
      ].filter((roundNumber) => roundNumber > 0)
    )
  ).sort((left, right) => left - right)

  const requestedRound = Number.parseInt(searchParams?.round ?? '', 10)
  const statusMessage = tournamentStatusMessage(searchParams?.status)
  const fallbackRound = t.currentRound > 0 ? t.currentRound : availableRounds.at(-1) ?? 0
  const selectedRound = availableRounds.includes(requestedRound) ? requestedRound : fallbackRound
  const selectedRoundIndex = availableRounds.indexOf(selectedRound)
  const previousRound = selectedRoundIndex > 0 ? availableRounds[selectedRoundIndex - 1] : null
  const nextRound =
    selectedRoundIndex >= 0 && selectedRoundIndex < availableRounds.length - 1
      ? availableRounds[selectedRoundIndex + 1]
      : null

  const currentRoundMatches = t.matches.filter((match) => match.roundNumber === t.currentRound)
  const selectedRoundMatches = t.matches.filter((match) => match.roundNumber === selectedRound)
  const currentRoundFinalized =
    t.currentRound > 0 && t.standings.some((standing) => standing.roundNumber === t.currentRound)
  const selectedRoundFinalized =
    selectedRound > 0 && t.standings.some((standing) => standing.roundNumber === selectedRound)
  const isViewingCurrentRound = selectedRound === t.currentRound
  const visibleSelectedRoundMatches = selectedRoundMatches.filter(
    (match) => match.isBye || match.player2Id
  )
  const unpairedCurrentRoundMatches = currentRoundMatches.filter(
    (match) => match.player1Id && !match.player2Id && !match.isBye && match.result === MATCH_RESULT.PENDING
  )
  const currentRoundHasBye = currentRoundMatches.some((match) => match.isBye)

  const latestClosedRound = t.standings.reduce(
    (maxRound, standing) => Math.max(maxRound, standing.roundNumber),
    0
  )
  const standingRounds = Array.from(
    new Set(t.standings.map((standing) => standing.roundNumber))
  ).sort((left, right) => left - right)
  const displayStandingsRound = [...standingRounds]
    .reverse()
    .find((roundNumber) => roundNumber <= selectedRound) ?? (selectedRoundFinalized ? selectedRound : latestClosedRound)
  const playersById = new Map(
    t.enrollments.map((enrollment) => [enrollment.playerId, enrollment.player])
  )
  const displayStandings =
    displayStandingsRound > 0
      ? calculateStandings(
          t.enrollments.map((enrollment) => enrollment.playerId),
          t.matches.filter((match) => match.roundNumber <= displayStandingsRound)
        ).flatMap((standing, index) => {
          const player = playersById.get(standing.playerId)

          if (!player) {
            return []
          }

          return [
            {
              ...standing,
              id: `${displayStandingsRound}-${standing.playerId}`,
              rank: index + 1,
              player,
            },
          ]
        })
      : []

  const canStartNextRound =
    t.progress === TOURN_PROGRESS.ACTIVE &&
    t.currentRound < t.roundCount &&
    (t.currentRound === 0 ? currentRoundMatches.length === 0 : currentRoundFinalized)
  const canManageCurrentRound =
    t.progress === TOURN_PROGRESS.ACTIVE &&
    t.currentRound > 0 &&
    currentRoundMatches.length > 0 &&
    !currentRoundFinalized
  const canManageSelectedRound = canManageCurrentRound && isViewingCurrentRound
  const canEndRound =
    canManageCurrentRound && currentRoundMatches.every((match) => match.result !== MATCH_RESULT.PENDING)
  const manualPairingOpen = searchParams?.manualPairing === '1' && canManageSelectedRound
  const sourceMatchForManualPairing = searchParams?.sourceMatchId
    ? currentRoundMatches.find(
        (match) =>
          match.id === searchParams.sourceMatchId &&
          !isPlaceholderMatch(match) &&
          (Boolean(match.player2Id) || match.isBye)
      )
    : null
  const closeManualPairingHref = tournamentDetailPath(t.id, {
    round: selectedRound,
  })
  const reopenManualPairingHref = tournamentDetailPath(t.id, {
    round: selectedRound,
    manualPairing: true,
  })

  const tournamentStateLabel =
    t.progress === TOURN_PROGRESS.FINISHED
      ? 'Torneo chiuso'
      : t.currentRound === 0
        ? 'Pronto a partire'
        : currentRoundFinalized
          ? `Round ${t.currentRound} chiuso`
          : `Round ${t.currentRound} aperto`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t.name}</h1>
          <p className="text-gray-500">
            {t.type} - {t.format} | Round {t.currentRound} di {t.roundCount}
          </p>
          <p className="mt-1 text-sm text-gray-600">{tournamentStateLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canStartNextRound && (
            <form action={startRound.bind(null, t.id)}>
              <button className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700">
                Avvia Round {t.currentRound + 1}
              </button>
            </form>
          )}

          {t.progress === TOURN_PROGRESS.ACTIVE && currentRoundMatches.length > 0 && !currentRoundFinalized && (
            <form action={endRound.bind(null, t.id)}>
              <button
                disabled={!canEndRound}
                className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                Fine Round
              </button>
            </form>
          )}

          {canManageCurrentRound && (
            <form action={repairCurrentRound.bind(null, t.id)}>
              <button className="rounded bg-orange-100 px-4 py-2 text-orange-800 hover:bg-orange-200">
                Rigenera Pairing
              </button>
            </form>
          )}

          {t.currentRound > 0 && (
            <form action={undoLastRound.bind(null, t.id)}>
              <button className="rounded bg-yellow-100 px-4 py-2 text-yellow-800 hover:bg-yellow-200">
                Annulla Ultimo Round
              </button>
            </form>
          )}

          {t.snapshots.length > 0 && (
            <form action={restoreLatestCheckpoint.bind(null, t.id)}>
              <button className="rounded bg-slate-100 px-4 py-2 text-slate-800 hover:bg-slate-200">
                Undo Ultima Azione
              </button>
            </form>
          )}

          {t.progress === TOURN_PROGRESS.ACTIVE ? (
            <form action={closeTournament.bind(null, t.id)}>
              <button className="rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-900">
                Chiudi Torneo
              </button>
            </form>
          ) : (
            <form action={reopenTournament.bind(null, t.id)}>
              <button className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
                Riapri Torneo
              </button>
            </form>
          )}

          <form action={deleteTournament.bind(null, t.id)}>
            <ConfirmSubmitButton
              type="submit"
              confirmMessage={`Eliminare il torneo ${t.name}? Tutti gli iscritti, match, standings e snapshot verranno rimossi.`}
              className="rounded bg-red-100 px-4 py-2 text-red-800 hover:bg-red-200"
            >
              Elimina Torneo
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      {statusMessage && (
        <div className={`rounded border px-4 py-3 text-sm ${statusMessage.className}`}>
          {statusMessage.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4">
          <h2 className="border-b pb-2 text-xl font-bold">Iscritti ({t.enrollments.length})</h2>
          {t.progress === TOURN_PROGRESS.ACTIVE && t.currentRound === 0 && (
            <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
              <div>
                <h3 className="font-semibold text-gray-900">Iscrivi giocatore esistente</h3>
                <p className="text-sm text-gray-500">
                  Seleziona un giocatore già presente nell&apos;anagrafica e aggiungilo al torneo.
                </p>
              </div>

              <form action={enrollPlayer} className="flex gap-2">
                <input type="hidden" name="tournamentId" value={t.id} />
                <select
                  name="playerId"
                  className="flex-1 rounded border p-2"
                  disabled={availablePlayers.length === 0}
                >
                  {availablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.lastName} {player.firstName}
                    </option>
                  ))}
                </select>
                <button
                  disabled={availablePlayers.length === 0}
                  className="rounded bg-indigo-600 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-indigo-300"
                >
                  Iscrivi
                </button>
              </form>

              <div className="border-t pt-3">
                <h3 className="font-semibold text-gray-900">Crea e iscrivi nuovo giocatore</h3>
                <p className="text-sm text-gray-500">
                  Inserisci i dati anagrafici per aggiungere subito un nuovo giocatore al torneo.
                </p>
              </div>

              <form action={createAndEnrollPlayer} className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <input type="hidden" name="tournamentId" value={t.id} />
                <input
                  type="text"
                  name="firstName"
                  required
                  placeholder="Nome"
                  className="rounded border p-2 text-sm"
                />
                <input
                  type="text"
                  name="lastName"
                  required
                  placeholder="Cognome"
                  className="rounded border p-2 text-sm"
                />
                <input
                  type="text"
                  name="udeId"
                  placeholder="UDE ID"
                  className="rounded border p-2 text-sm"
                />
                <button className="rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700">
                  Crea e Iscrivi
                </button>
              </form>
            </div>
          )}
          <ul className="max-h-[500px] divide-y overflow-auto rounded border bg-white">
            {t.enrollments.map((enrollment) => (
              <li key={enrollment.id} className="flex items-center justify-between gap-3 p-3">
                <div>
                  <span className={enrollment.dropped ? 'text-gray-400 line-through' : ''}>
                    {enrollment.player.lastName} {enrollment.player.firstName}
                  </span>
                  {enrollment.dropped && (
                    <p className="text-xs text-gray-500">
                      Drop registrato al round {enrollment.droppedRound ?? '-'}
                    </p>
                  )}
                </div>

                {t.progress === TOURN_PROGRESS.ACTIVE && t.currentRound === 0 ? (
                  <form action={removeEnrollment.bind(null, enrollment.playerId, t.id)}>
                    <button type="submit" className="text-xs text-red-600 hover:underline">
                      Rimuovi
                    </button>
                  </form>
                ) : t.progress === TOURN_PROGRESS.ACTIVE ? (
                  enrollment.dropped ? (
                    <form action={restorePlayer.bind(null, enrollment.playerId, t.id)}>
                      <button type="submit" className="text-xs text-emerald-700 hover:underline">
                        Ripristina
                      </button>
                    </form>
                  ) : (
                    <form action={dropPlayer.bind(null, enrollment.playerId, t.id)}>
                      <button type="submit" className="text-xs text-red-600 hover:underline">
                        Drop
                      </button>
                    </form>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 border-b pb-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">
                {selectedRound > 0 ? `Round ${selectedRound} Matches` : 'Matches'}
              </h2>
              <div className="flex items-center gap-2 text-sm">
                {canManageSelectedRound && unpairedCurrentRoundMatches.length > 0 && !manualPairingOpen && (
                  <Link
                    href={reopenManualPairingHref}
                    className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 hover:bg-indigo-100"
                  >
                    Apri Manuale
                  </Link>
                )}
                {availableRounds.length > 0 && (
                  <>
                    {previousRound ? (
                      <Link
                        href={`/tournaments/${t.id}?round=${previousRound}`}
                        className="rounded border px-3 py-1 text-gray-700 hover:bg-gray-50"
                      >
                        Round precedente
                      </Link>
                    ) : (
                      <span className="rounded border px-3 py-1 text-gray-300">Round precedente</span>
                    )}
                    {nextRound ? (
                      <Link
                        href={`/tournaments/${t.id}?round=${nextRound}`}
                        className="rounded border px-3 py-1 text-gray-700 hover:bg-gray-50"
                      >
                        Round successivo
                      </Link>
                    ) : (
                      <span className="rounded border px-3 py-1 text-gray-300">Round successivo</span>
                    )}
                  </>
                )}
              </div>
            </div>
            {selectedRound > 0 && (
              <p className="text-sm text-gray-600">
                {isViewingCurrentRound
                  ? selectedRoundFinalized
                    ? 'Stai visualizzando il round corrente chiuso.'
                    : 'Stai visualizzando il round corrente aperto.'
                  : 'Stai visualizzando un round storico in sola lettura.'}
              </p>
            )}
          </div>

          <div className="space-y-3">
            {visibleSelectedRoundMatches.map((match) => {
              const player1Won = match.isBye || match.result === MATCH_RESULT.P1_WIN
              const player2Won = match.result === MATCH_RESULT.P2_WIN

              return (
                <div key={match.id} className="rounded border bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">
                        {match.tableNumber ? `Tavolo ${match.tableNumber}` : 'Abbinamento manuale'}
                      </span>
                      {match.isManual && (
                        <span className="rounded bg-indigo-100 px-2 py-1 text-xs text-indigo-800">
                          Manuale
                        </span>
                      )}
                    </div>
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        match.result === MATCH_RESULT.PENDING ? 'bg-yellow-100' : 'bg-green-100'
                      }`}
                    >
                      {matchResultLabel(match)}
                    </span>
                  </div>

                  {canManageSelectedRound && !match.isBye ? (
                    <MatchResultForm
                      action={submitMatchResult}
                      matchId={match.id}
                      tournamentId={t.id}
                      player1Id={match.player1Id ?? ''}
                      player2Id={match.player2Id ?? ''}
                      player1Name={`${match.player1?.lastName} ${match.player1?.firstName}`}
                      player2Name={`${match.player2?.lastName} ${match.player2?.firstName}`}
                      initialWinnerId={
                        match.result === MATCH_RESULT.P1_WIN
                          ? match.player1Id
                          : match.result === MATCH_RESULT.P2_WIN
                            ? match.player2Id
                            : null
                      }
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className={`rounded border p-3 ${player1Won ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                        <div className="font-medium">
                          {match.player1?.lastName} {match.player1?.firstName}
                        </div>
                        <div className="mt-3 text-sm text-gray-600">
                          {player1Won ? 'Vincitore' : 'Non selezionato'}
                        </div>
                      </div>
                      <div className={`rounded border p-3 ${player2Won ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}>
                        <div className="font-medium">
                          {match.isBye ? '- BYE -' : `${match.player2?.lastName} ${match.player2?.firstName}`}
                        </div>
                        <div className="mt-3 text-sm text-gray-600">
                          {match.isBye ? 'Assegnato automaticamente' : player2Won ? 'Vincitore' : 'Non selezionato'}
                        </div>
                      </div>
                    </div>
                  )}

                  {canManageSelectedRound && (
                    <div className="mt-2">
                      <Link
                        href={tournamentDetailPath(t.id, {
                          round: selectedRound,
                          manualPairing: true,
                          sourceMatchId: match.id,
                        })}
                        className="text-xs text-orange-700 hover:underline"
                      >
                        Split pairing
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}

            {visibleSelectedRoundMatches.length === 0 && (
              <p className="py-8 text-center italic text-gray-500">
                {selectedRound === 0
                  ? 'Nessun match attivo. Avvia il primo round.'
                  : 'Nessun pairing visibile per il round selezionato.'}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="border-b pb-2">
            <h2 className="text-xl font-bold">Classifica</h2>
            <p className="text-sm text-gray-600">
              {displayStandingsRound > 0
                ? `Situazione dopo il round ${displayStandingsRound}`
                : 'Nessuna classifica disponibile per il round selezionato.'}
            </p>
          </div>
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-center font-medium">Pts</th>
                  <th className="px-3 py-2 text-center font-medium">T1</th>
                  <th className="px-3 py-2 text-center font-medium">T2</th>
                  <th className="px-3 py-2 text-center font-medium">T3</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {displayStandings.map((standing, index) => (
                  <tr key={standing.id}>
                    <td className="px-3 py-2">{standing.rank ?? index + 1}</td>
                    <td className="max-w-[120px] truncate px-3 py-2">
                      {standing.player.lastName} {standing.player.firstName}
                    </td>
                    <td className="px-3 py-2 text-center font-bold">{standing.matchPoints}</td>
                    <td className="px-3 py-2 text-center">{formatTiebreaker(standing.tiebreaker1)}</td>
                    <td className="px-3 py-2 text-center">{formatTiebreaker(standing.tiebreaker2)}</td>
                    <td className="px-3 py-2 text-center">{formatTiebreaker(standing.tiebreaker3)}</td>
                  </tr>
                ))}
                {displayStandings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                      Nessuna classifica disponibile.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 rounded border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Undo e Checkpoint</h3>
                <p className="text-sm text-gray-600">
                  Ogni azione critica salva un checkpoint automatico prima della modifica.
                </p>
              </div>
              {t.snapshots.length > 0 && (
                <form action={restoreLatestCheckpoint.bind(null, t.id)}>
                  <button className="rounded bg-slate-100 px-3 py-2 text-sm text-slate-800 hover:bg-slate-200">
                    Ripristina Ultimo
                  </button>
                </form>
              )}
            </div>

            {t.snapshots.length === 0 ? (
              <p className="text-sm text-gray-500">Nessun checkpoint disponibile.</p>
            ) : (
              <ul className="space-y-2 text-sm text-gray-700">
                {t.snapshots.map((snapshot) => (
                  <li key={snapshot.id} className="rounded border border-gray-100 p-2">
                    <div className="font-medium">{snapshotReasonLabel(snapshot.reason)}</div>
                    <div className="text-xs text-gray-500">
                      {snapshot.createdAt.toLocaleString('it-IT')}
                      {snapshot.roundNumber ? ` · Round ${snapshot.roundNumber}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {manualPairingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Abbinamento Manuale</h2>
                <p className="text-sm text-slate-600">
                  Usa Split per portare i giocatori nel pool manuale, poi crea un nuovo pairing o assegna un BYE.
                </p>
              </div>
              <Link
                href={closeManualPairingHref}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Chiudi
              </Link>
            </div>

            <div className="space-y-4 px-6 py-5">
              {unpairedCurrentRoundMatches.length === 0 && sourceMatchForManualPairing ? (
                <>
                  <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">Pairing selezionato</p>
                    <p className="mt-2">
                      {sourceMatchForManualPairing.player1?.lastName} {sourceMatchForManualPairing.player1?.firstName}
                      {sourceMatchForManualPairing.isBye
                        ? ' · BYE'
                        : ` vs ${sourceMatchForManualPairing.player2?.lastName} ${sourceMatchForManualPairing.player2?.firstName}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <form action={splitManualPairing.bind(null, sourceMatchForManualPairing.id, t.id)}>
                      <button className="rounded bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
                        Conferma Split
                      </button>
                    </form>
                    <Link
                      href={closeManualPairingHref}
                      className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Chiudi
                    </Link>
                  </div>
                </>
              ) : unpairedCurrentRoundMatches.length > 0 ? (
                <>
                  <div className="rounded border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-900">Pool manuale attivo</p>
                    <ul className="mt-3 space-y-1 text-sm text-slate-700">
                      {unpairedCurrentRoundMatches.map((match) => (
                        <li key={match.id}>
                          {match.player1?.lastName} {match.player1?.firstName}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {unpairedCurrentRoundMatches.length >= 2 && (
                    <form action={createManualPairing} className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <input type="hidden" name="tournamentId" value={t.id} />
                      <select name="player1Id" className="rounded border p-2 text-sm">
                        {unpairedCurrentRoundMatches.map((match) => (
                          <option key={match.id} value={match.player1Id ?? ''}>
                            {match.player1?.lastName} {match.player1?.firstName}
                          </option>
                        ))}
                      </select>
                      <select name="player2Id" className="rounded border p-2 text-sm">
                        {unpairedCurrentRoundMatches.map((match) => (
                          <option key={match.id} value={match.player1Id ?? ''}>
                            {match.player1?.lastName} {match.player1?.firstName}
                          </option>
                        ))}
                      </select>
                      <button className="md:col-span-2 rounded bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700">
                        Crea Abbinamento Manuale
                      </button>
                    </form>
                  )}

                  {!currentRoundHasBye && (
                    <form action={assignManualBye} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                      <input type="hidden" name="tournamentId" value={t.id} />
                      <select name="playerId" className="rounded border p-2 text-sm">
                        {unpairedCurrentRoundMatches.map((match) => (
                          <option key={match.id} value={match.player1Id ?? ''}>
                            {match.player1?.lastName} {match.player1?.firstName}
                          </option>
                        ))}
                      </select>
                      <button className="rounded bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700">
                        Assegna BYE
                      </button>
                    </form>
                  )}

                  <div className="flex flex-wrap gap-3 border-t pt-4">
                    <form action={cancelManualPairing.bind(null, t.id)}>
                      <button className="rounded bg-amber-100 px-4 py-2 text-sm text-amber-800 hover:bg-amber-200">
                        Annulla Procedura
                      </button>
                    </form>
                    <Link
                      href={closeManualPairingHref}
                      className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Chiudi Popup
                    </Link>
                  </div>
                </>
              ) : (
                <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Nessun giocatore disponibile per l'abbinamento manuale.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
