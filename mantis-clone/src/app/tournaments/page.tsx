import { ConfirmSubmitButton } from '@/components/confirm-submit-button'
import { deleteTournament } from '@/lib/actions'
import { prisma } from '@/lib/db'
import Link from 'next/link'

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams?: { status?: string }
}) {
  const status = searchParams?.status

  const tournaments = await prisma.tournament.findMany({
    orderBy: { date: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Tornei</h1>
        <Link
          href="/tournaments/new"
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Crea Torneo
        </Link>
      </div>

      {status === 'tournament-deleted' && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Torneo eliminato correttamente.
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stato
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Round
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Azioni
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tournaments.map((t) => (
              <tr key={t.id}>
                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                  {t.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  {t.type} - {t.format}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    t.progress === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {t.progress}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                  {t.currentRound} / {t.roundCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      href={`/tournaments/${t.id}`}
                      className="font-medium text-indigo-600 hover:text-indigo-900"
                    >
                      Gestisci
                    </Link>

                    <form action={deleteTournament.bind(null, t.id)}>
                      <ConfirmSubmitButton
                        type="submit"
                        confirmMessage={`Eliminare il torneo ${t.name}? Tutti gli iscritti, match, standings e snapshot verranno rimossi.`}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Elimina
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {tournaments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Nessun torneo trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
