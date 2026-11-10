'use client'

import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

type MatchResultFormProps = {
  action: (formData: FormData) => void | Promise<void>
  matchId: string
  tournamentId: string
  player1Id: string
  player2Id: string
  player1Name: string
  player2Name: string
  initialWinnerId?: string | null
}

function MatchResultFormStatus() {
  const { pending } = useFormStatus()

  if (!pending) {
    return null
  }

  return <p className="text-xs text-gray-500">Aggiornamento risultato...</p>
}

export function MatchResultForm({
  action,
  matchId,
  tournamentId,
  player1Id,
  player2Id,
  player1Name,
  player2Name,
  initialWinnerId,
}: MatchResultFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const [selectedWinnerId, setSelectedWinnerId] = useState(initialWinnerId ?? '')

  const submitWinner = (winnerId: string) => {
    setSelectedWinnerId(winnerId)
    window.requestAnimationFrame(() => {
      formRef.current?.requestSubmit()
    })
  }

  const player1Won = selectedWinnerId === player1Id
  const player2Won = selectedWinnerId === player2Id

  return (
    <form ref={formRef} action={action} className="mt-4 space-y-3 border-t pt-4">
      <input type="hidden" name="matchId" value={matchId} />
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label
          className={`rounded border p-3 text-sm ${player1Won ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">{player1Name}</div>
            <input
              type="radio"
              name="winnerId"
              value={player1Id}
              checked={player1Won}
              onChange={() => submitWinner(player1Id)}
              required
            />
          </div>
          <div className="mt-3 text-sm text-gray-600">
            {player1Won ? 'Vincitore' : 'Seleziona'}
          </div>
        </label>
        <label
          className={`rounded border p-3 text-sm ${player2Won ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium">{player2Name}</div>
            <input
              type="radio"
              name="winnerId"
              value={player2Id}
              checked={player2Won}
              onChange={() => submitWinner(player2Id)}
              required
            />
          </div>
          <div className="mt-3 text-sm text-gray-600">
            {player2Won ? 'Vincitore' : 'Seleziona'}
          </div>
        </label>
      </div>
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      <MatchResultFormStatus />
    </form>
  )
}