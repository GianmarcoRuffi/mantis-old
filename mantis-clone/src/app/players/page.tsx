import { ConfirmSubmitButton } from '@/components/confirm-submit-button'
import { deletePlayer } from '@/lib/actions'
import { TOURN_PROGRESS } from '@/lib/constants'
import { prisma } from '@/lib/db'
import Link from 'next/link'

export default async function PlayersPage({
  searchParams,
}: {
  searchParams?: { q?: string; status?: string }
}) {
  const query = searchParams?.q?.trim() ?? ''
  const status = searchParams?.status

  const players = await prisma.player.findMany({
    where: query
      ? {
          OR: [
            { firstName: { contains: query } },
            { lastName: { contains: query } },
            { udeId: { contains: query } },
          ],
        }
      : undefined,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: {
      enrollments: {
        where: {
          tournament: {
            progress: TOURN_PROGRESS.ACTIVE,
          },
        },
        select: { id: true },
      },
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Giocatori</h1>
        <Link
          href="/players/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Aggiungi Giocatore
        </Link>
      </div>

      {status === 'player-deleted' && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Giocatore eliminato correttamente.
        </div>
      )}

      {status === 'player-active-tournament' && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Non puoi eliminare un giocatore presente in un torneo attivo.
        </div>
      )}

      <form className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="q" className="block text-sm font-medium text-gray-700">
            Cerca giocatore
          </label>
          <input
            id="q"
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Nome, cognome o UDE ID"
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
          >
            Cerca
          </button>
          <Link
            href="/players"
            className="rounded border border-gray-300 bg-gray-100 px-4 py-2 text-gray-800 hover:bg-gray-200"
          >
            Reset
          </Link>
        </div>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Cognome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                UDE ID
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {players.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4 whitespace-nowrap">{p.lastName}</td>
                <td className="px-6 py-4 whitespace-nowrap">{p.firstName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  {p.udeId || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/players/${p.id}/edit`}
                      className="font-medium text-indigo-600 hover:text-indigo-900"
                    >
                      Modifica
                    </Link>

                    {p.enrollments.length > 0 ? (
                      <span className="text-xs text-amber-700">In torneo attivo</span>
                    ) : (
                      <form action={deletePlayer}>
                        <input type="hidden" name="playerId" value={p.id} />
                        <ConfirmSubmitButton
                          type="submit"
                          confirmMessage={`Eliminare ${p.lastName} ${p.firstName}? L'operazione rimuove anche i dati storici collegati ai tornei chiusi.`}
                          className="text-sm font-medium text-red-600 hover:text-red-800"
                        >
                          Elimina
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {players.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  {query ? 'Nessun giocatore corrisponde alla ricerca.' : 'Nessun giocatore trovato.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
