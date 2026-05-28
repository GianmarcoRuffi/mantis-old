import { prisma } from '@/lib/db'
import { 
  startRound, 
  endRound, 
  submitMatchResult, 
  closeTournament, 
  undoLastRound, 
  enrollPlayer,
  dropPlayer
} from '@/lib/actions'
import { MATCH_RESULT } from '@/lib/constants'

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
  const t = await prisma.tournament.findUnique({
    where: { id: params.id },
    include: {
      enrollments: { include: { player: true } },
      matches: {
        include: { player1: true, player2: true },
        orderBy: { tableNumber: 'asc' },
      },
      standings: {
        include: { player: true },
        orderBy: { rank: 'asc' },
      },
    },
  })

  if (!t) return <div>Torneo non trovato</div>

  const allPlayers = await prisma.player.findMany()
  const enrolledPlayerIds = t.enrollments.map((e) => e.playerId)
  const availablePlayers = allPlayers.filter((p) => !enrolledPlayerIds.includes(p.id))

  const currentRoundMatches = t.matches.filter((m) => m.roundNumber === t.currentRound)
  
  // Latest standings (of current or previous round)
  const latestStandings = t.standings.filter(s => s.roundNumber === t.currentRound)
  const displayStandings = latestStandings.length > 0 ? latestStandings : t.standings.filter(s => s.roundNumber === Math.max(0, t.currentRound - 1))

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold">{t.name}</h1>
          <p className="text-gray-500">{t.type} - {t.format} | Round {t.currentRound} di {t.roundCount}</p>
        </div>
        <div className="flex gap-2">
          {t.progress === 'ACTIVE' && (
            <>
              {currentRoundMatches.length === 0 ? (
                <form action={startRound.bind(null, t.id)}>
                  <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                    Avvia Round {t.currentRound + 1}
                  </button>
                </form>
              ) : (
                <form action={endRound.bind(null, t.id)}>
                  <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    Fine Round
                  </button>
                </form>
              )}
              <form action={undoLastRound.bind(null, t.id)}>
                <button className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded hover:bg-yellow-200">
                  Annulla Round
                </button>
              </form>
              <form action={closeTournament.bind(null, t.id)}>
                <button className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-900">
                  Chiudi Torneo
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Colonna Giocatori */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold border-b pb-2">Iscritti ({t.enrollments.length})</h2>
          {t.progress === 'ACTIVE' && t.currentRound === 0 && (
            <form action={enrollPlayer} className="flex gap-2">
              <input type="hidden" name="tournamentId" value={t.id} />
              <select name="playerId" className="flex-1 border rounded p-1">
                {availablePlayers.map(p => (
                  <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>
                ))}
              </select>
              <button className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">Iscrivi</button>
            </form>
          )}
          <ul className="divide-y border rounded bg-white max-h-[500px] overflow-auto">
            {t.enrollments.map(e => (
              <li key={e.id} className="p-3 flex justify-between items-center">
                <span className={e.dropped ? 'text-gray-400 line-through' : ''}>
                  {e.player.lastName} {e.player.firstName}
                </span>
                {!e.dropped && t.progress === 'ACTIVE' && (
                  <form action={dropPlayer.bind(null, e.playerId, t.id)}>
                    <button 
                      type="submit"
                      className="text-red-600 text-xs hover:underline"
                    >
                      Drop
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Colonna Abbinamenti */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold border-b pb-2">Round {t.currentRound} Matches</h2>
          <div className="space-y-3">
            {currentRoundMatches.map(m => (
              <div key={m.id} className="border rounded bg-white p-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-bold">Tavolo {m.tableNumber}</span>
                  <span className={`text-xs px-2 py-1 rounded ${m.result === 'PENDING' ? 'bg-yellow-100' : 'bg-green-100'}`}>
                    {m.result}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between">
                    <span>{m.player1?.lastName} {m.player1?.firstName}</span>
                    <span className="font-mono">{m.gamesWon1}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{m.isBye ? '- BYE -' : `${m.player2?.lastName} ${m.player2?.firstName}`}</span>
                    <span className="font-mono">{m.gamesWon2}</span>
                  </div>
                </div>
                {!m.isBye && m.result === 'PENDING' && (
                  <form action={submitMatchResult} className="mt-4 pt-4 border-t grid grid-cols-2 gap-2">
                    <input type="hidden" name="matchId" value={m.id} />
                    <input type="hidden" name="tournamentId" value={t.id} />
                    <select name="result" className="col-span-2 border rounded p-1 text-sm">
                      <option value={MATCH_RESULT.P1_WIN}>Vince P1</option>
                      <option value={MATCH_RESULT.P2_WIN}>Vince P2</option>
                      <option value={MATCH_RESULT.DRAW}>Pareggio</option>
                    </select>
                    <input type="number" name="gamesWon1" placeholder="G1" className="border rounded p-1 text-sm" defaultValue={0} />
                    <input type="number" name="gamesWon2" placeholder="G2" className="border rounded p-1 text-sm" defaultValue={0} />
                    <button className="col-span-2 bg-indigo-600 text-white p-1 rounded text-sm mt-1">Invia</button>
                  </form>
                )}
              </div>
            ))}
            {currentRoundMatches.length === 0 && (
              <p className="text-gray-500 italic text-center py-8">Nessun match attivo. Avvia il round.</p>
            )}
          </div>
        </div>

        {/* Colonna Classifica */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold border-b pb-2">Classifica</h2>
          <div className="overflow-x-auto border rounded bg-white">
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
                {displayStandings.map((s, idx) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{idx + 1}</td>
                    <td className="px-3 py-2 truncate max-w-[120px]">{s.player.lastName} {s.player.firstName}</td>
                    <td className="px-3 py-2 text-center font-bold">{s.matchPoints}</td>
                    <td className="px-3 py-2 text-center">{(s.omwPct * 100).toFixed(0)}%</td>
                    <td className="px-3 py-2 text-center">{(s.gwPct * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
/home/engine/.bashrc: line 1: syntax error near unexpected token `('
/home/engine/.bashrc: line 1: `. /etc/profile.d/workload-containment.shn# ~/.bashrc: executed by bash(1) for non-login shells.'
/home/engine/.bashrc: line 1: syntax error near unexpected token `('
/home/engine/.bashrc: line 1: `. /etc/profile.d/workload-containment.shn# ~/.bashrc: executed by bash(1) for non-login shells.'
/home/engine/.bashrc: line 1: syntax error near unexpected token `('
/home/engine/.bashrc: line 1: `. /etc/profile.d/workload-containment.shn# ~/.bashrc: executed by bash(1) for non-login shells.'
/home/engine/.bashrc: line 1: syntax error near unexpected token `('
/home/engine/.bashrc: line 1: `. /etc/profile.d/workload-containment.shn# ~/.bashrc: executed by bash(1) for non-login shells.'
/home/engine/.bashrc: line 1: syntax error near unexpected token `('
/home/engine/.bashrc: line 1: `. /etc/profile.d/workload-containment.shn# ~/.bashrc: executed by bash(1) for non-login shells.'
/home/engine/.bashrc: line 1: syntax error near unexpected token `('
/home/engine/.bashrc: line 1: `. /etc/profile.d/workload-containment.shn# ~/.bashrc: executed by bash(1) for non-login shells.'
