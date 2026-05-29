import Link from 'next/link'
import { notFound } from 'next/navigation'

import { updatePlayer } from '@/lib/actions'
import { prisma } from '@/lib/db'

export default async function EditPlayerPage({
  params,
}: {
  params: { id: string }
}) {
  const player = await prisma.player.findUnique({
    where: { id: params.id },
  })

  if (!player) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Modifica Giocatore</h1>

      <form action={updatePlayer} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow">
        <input type="hidden" name="playerId" value={player.id} />

        <div>
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            name="firstName"
            required
            defaultValue={player.firstName}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Cognome</label>
          <input
            type="text"
            name="lastName"
            required
            defaultValue={player.lastName}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">UDE ID (opzionale)</label>
          <input
            type="text"
            name="udeId"
            defaultValue={player.udeId ?? ''}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="rounded bg-indigo-600 px-6 py-2 font-medium text-white hover:bg-indigo-700"
          >
            Salva Modifiche
          </button>
          <Link
            href="/players"
            className="rounded border border-gray-300 bg-gray-100 px-6 py-2 text-gray-800 hover:bg-gray-200"
          >
            Annulla
          </Link>
        </div>
      </form>
    </div>
  )
}