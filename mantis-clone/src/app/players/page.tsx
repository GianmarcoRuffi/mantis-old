import { prisma } from '@/lib/db'
import Link from 'next/link'

export default async function PlayersPage() {
  const players = await prisma.player.findMany({
    orderBy: { lastName: 'asc' },
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
              </tr>
            ))}
            {players.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  Nessun giocatore trovato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
