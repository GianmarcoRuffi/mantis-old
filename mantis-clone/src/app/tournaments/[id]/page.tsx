import { prisma } from '@/lib/db'
import {
  assignManualBye,
  closeTournament,
  createManualPairing,
  dropPlayer,
  endRound,
  enrollPlayer,
  repairCurrentRound,
  reopenTournament,
  restoreLatestCheckpoint,
  restorePlayer,
  splitManualPairing,
  startRound,
  submitMatchResult,
  undoLastRound,
} from '@/lib/actions'
import { MATCH_RESULT, TOURN_PROGRESS } from '@/lib/constants'

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

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
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

  const currentRoundMatches = t.matches.filter((match) => match.roundNumber === t.currentRound)
  const currentRoundFinalized =
    t.currentRound > 0 && t.standings.some((standing) => standing.roundNumber === t.currentRound)
  const visibleCurrentRoundMatches = currentRoundMatches.filter(
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
  const displayStandingsRound = currentRoundFinalized ? t.currentRound : latestClosedRound
  const displayStandings = t.standings
    .filter((standing) => standing.roundNumber === displayStandingsRound)
    .sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER))

  const canStartNextRound =
    t.progress === TOURN_PROGRESS.ACTIVE &&
    t.currentRound < t.roundCount &&
    (t.currentRound === 0 ? currentRoundMatches.length === 0 : currentRoundFinalized)
  const canManageCurrentRound =
    t.progress === TOURN_PROGRESS.ACTIVE &&
    t.currentRound > 0 &&
    currentRoundMatches.length > 0 &&
    !currentRoundFinalized
  const canEndRound =
    canManageCurrentRound && currentRoundMatches.every((match) => match.result !== MATCH_RESULT.PENDING)

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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-4">
          <h2 className="border-b pb-2 text-xl font-bold">Iscritti ({t.enrollments.length})</h2>
          {t.progress === TOURN_PROGRESS.ACTIVE && t.currentRound === 0 && (
            <form action={enrollPlayer} className="flex gap-2">
              <input type="hidden" name="tournamentId" value={t.id} />
              <select
                name="playerId"
                className="flex-1 rounded border p-1"
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
                className="rounded bg-indigo-600 px-3 py-1 text-sm text-white disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                Iscrivi
              </button>
            </form>
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

                {t.progress === TOURN_PROGRESS.ACTIVE && (
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
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <h2 className="border-b pb-2 text-xl font-bold">Round {t.currentRound} Matches</h2>

          {canManageCurrentRound && (
            <div className="space-y-3 rounded border border-dashed border-slate-300 bg-slate-50 p-4">
              <div>
                <h3 className="font-semibold text-slate-900">Abbinamento manuale</h3>
                <p className="text-sm text-slate-600">
                  Usa Split su un tavolo per riportare i giocatori nel pool manuale, poi crea un nuovo pairing o assegna un BYE.
                </p>
              </div>

              {unpairedCurrentRoundMatches.length === 0 ? (
                <p className="text-sm text-slate-500">Nessun giocatore libero in questo round.</p>
              ) : (
                <>
                  <ul className="space-y-1 text-sm text-slate-700">
                    {unpairedCurrentRoundMatches.map((match) => (
                      <li key={match.id}>
                        {match.player1?.lastName} {match.player1?.firstName}
                      </li>
                    ))}
                  </ul>

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
                </>
              )}
            </div>
          )}

          <div className="space-y-3">
            {visibleCurrentRoundMatches.map((match) => {
              const defaultResult =
                match.result === MATCH_RESULT.PENDING ? MATCH_RESULT.P1_WIN : match.result

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
                      {match.result}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between gap-3">
                      <span>{match.player1?.lastName} {match.player1?.firstName}</span>
                      <span className="font-mono">{match.gamesWon1}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>
                        {match.isBye ? '- BYE -' : `${match.player2?.lastName} ${match.player2?.firstName}`}
                      </span>
                      <span className="font-mono">{match.gamesWon2}</span>
                    </div>
                  </div>

                  {canManageCurrentRound && !match.isBye && (
                    <form action={submitMatchResult} className="mt-4 grid grid-cols-2 gap-2 border-t pt-4">
                      <input type="hidden" name="matchId" value={match.id} />
                      <input type="hidden" name="tournamentId" value={t.id} />
                      <select
                        name="result"
                        defaultValue={defaultResult}
                        className="col-span-2 rounded border p-1 text-sm"
                      >
                        <option value={MATCH_RESULT.P1_WIN}>Vince P1</option>
                        <option value={MATCH_RESULT.P2_WIN}>Vince P2</option>
                        <option value={MATCH_RESULT.DRAW}>Pareggio</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        name="gamesWon1"
                        defaultValue={match.gamesWon1}
                        className="rounded border p-1 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        name="gamesWon2"
                        defaultValue={match.gamesWon2}
                        className="rounded border p-1 text-sm"
                      />
                      <button className="rounded bg-indigo-600 p-1 text-sm text-white hover:bg-indigo-700">
                        {match.result === MATCH_RESULT.PENDING ? 'Invia Risultato' : 'Aggiorna Risultato'}
                      </button>
                    </form>
                  )}

                  {canManageCurrentRound && (
                    <form action={splitManualPairing.bind(null, match.id, t.id)} className="mt-2">
                      <button className="text-xs text-orange-700 hover:underline">
                        Split pairing
                      </button>
                    </form>
                  )}
                </div>
              )
            })}

            {visibleCurrentRoundMatches.length === 0 && (
              <p className="py-8 text-center italic text-gray-500">
                {t.currentRound === 0
                  ? 'Nessun match attivo. Avvia il primo round.'
                  : 'Nessun pairing visibile per il round corrente.'}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="border-b pb-2 text-xl font-bold">Classifica</h2>
          <div className="overflow-x-auto rounded border bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Nome</th>
                  <th className="px-3 py-2 text-center font-medium">Pts</th>
                  <th className="px-3 py-2 text-center font-medium">OMW%</th>
                  <th className="px-3 py-2 text-center font-medium">GW%</th>
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
                    <td className="px-3 py-2 text-center">{(standing.omwPct * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-center">{(standing.gwPct * 100).toFixed(0)}%</td>
                  </tr>
                ))}
                {displayStandings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
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
    </div>
  )
}
