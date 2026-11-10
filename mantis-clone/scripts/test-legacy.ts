import { cases, loadFixture, loadReference, calculatedRows, referenceCheck, saveReport, type Check } from '../tests/legacy/support'

const checks: Check[] = []
for (const id of cases) {
  try {
    const f = loadFixture(id)
    const reference = loadReference(f)
    for (const round of f.rounds)
      checks.push(referenceCheck(f, reference, round.number, 'calculation', calculatedRows(f, round.number)))
  } catch (error) {
    checks.push({ tournament: id, round: 0, layer: 'validation', status: 'FAIL', differences: [], detail: String(error) })
  }
}
process.exitCode = saveReport('calculation', checks)
