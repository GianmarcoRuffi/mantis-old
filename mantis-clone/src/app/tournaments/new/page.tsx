import { createTournament } from '@/lib/actions'
import { TOURN_TYPE, TOURN_FORMAT, GAMES } from '@/lib/constants'

export default function NewTournamentPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Nuovo Torneo</h1>

      <form action={createTournament} className="bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nome Torneo</label>
          <input
            type="text"
            name="name"
            required
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Gioco</label>
            <select
              name="gameId"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            >
              {GAMES.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Round Totali</label>
            <input
              type="number"
              name="roundCount"
              defaultValue={4}
              min={1}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Tipo</label>
            <select
              name="type"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            >
              <option value={TOURN_TYPE.SWISS}>Svizzera</option>
              <option value={TOURN_TYPE.SINGLE_ELIM}>Eliminazione Singola</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Formato</label>
            <select
              name="format"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            >
              <option value={TOURN_FORMAT.CONSTRUCTED}>Costruito</option>
              <option value={TOURN_FORMAT.SEALED}>Sealed Deck</option>
              <option value={TOURN_FORMAT.DRAFT}>Booster Draft</option>
            </select>
          </div>
        </div>

        <div className="pt-4 flex gap-4">
          <button
            type="submit"
            className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 font-medium"
          >
            Crea
          </button>
          <a
            href="/tournaments"
            className="bg-gray-100 text-gray-800 px-6 py-2 rounded border border-gray-300 hover:bg-gray-200"
          >
            Annulla
          </a>
        </div>
      </form>
    </div>
  )
}
