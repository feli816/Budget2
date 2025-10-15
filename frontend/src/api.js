const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function jsonOrThrow(res, fallbackMsg) {
  let data = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `${fallbackMsg} (${res.status})`
    throw new Error(msg)
  }
  return data
}

export async function getHealth() {
  const res = await fetch(`${API_URL}/health`)
  return jsonOrThrow(res, 'Health failed')
}

export async function postImportExcel() {
  // En mode stub (backend DISABLE_DB=1), aucun fichier n’est requis.
  const res = await fetch(`${API_URL}/imports/excel`, { method: 'POST' })
  return jsonOrThrow(res, 'POST /imports/excel failed')
}

export async function getImport(id) {
  const res = await fetch(`${API_URL}/imports/${id}`)
  return jsonOrThrow(res, `GET /imports/${id} failed`)
}
