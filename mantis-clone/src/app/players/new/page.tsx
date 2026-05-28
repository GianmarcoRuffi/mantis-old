import { createPlayer } from '@/lib/actions'

export default function NewPlayerPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Nuovo Giocatore</h1>

      <form action={createPlayer} className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome</label>
          <input
            type="text"
            name="firstName"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Cognome</label>
          <input
            type="text"
            name="lastName"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">UDE ID (opzionale)</label>
          <input
            type="text"
            name="udeId"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
          />
        </div>

        <div className="pt-4 flex gap-4">
          <button
            type="submit"
            className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 font-medium"
          >
            Salva
          </button>
          <a
            href="/players"
            className="bg-gray-100 text-gray-800 px-6 py-2 rounded border border-gray-300 hover:bg-gray-200"
          >
            Annulla
          </a>
        </div>
      </form>
    </div>
  )
}
