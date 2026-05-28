import { prisma } from '@/lib/db'
import Link from 'next/link'

export default async function Home() {
  const playerCount = await prisma.player.count()
  const tournamentCount = await prisma.tournament.count()

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h2 className="text-xl font-semibold mb-2">Giocatori</h2>
          <p className="text-4xl font-bold text-indigo-600">{playerCount}</p>
          <div className="mt-4">
            <Link href="/players" className="text-indigo-600 hover:underline">
              Visualizza tutti →
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
          <h2 className="text-xl font-semibold mb-2">Tornei</h2>
          <p className="text-4xl font-bold text-indigo-600">{tournamentCount}</p>
          <div className="mt-4">
            <Link href="/tournaments" className="text-indigo-600 hover:underline">
              Visualizza tutti →
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-bold mb-4">Azioni Rapide</h2>
        <div className="flex gap-4">
          <Link
            href="/tournaments/new"
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Nuovo Torneo
          </Link>
          <Link
            href="/players/new"
            className="bg-gray-100 text-gray-800 px-4 py-2 rounded border border-gray-300 hover:bg-gray-200"
          >
            Nuovo Giocatore
          </Link>
        </div>
      </div>
    </div>
  )
}
