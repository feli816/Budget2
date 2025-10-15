import { useEffect, useState } from 'react'
import { getHealth, postImportExcel, getImport } from './api'

function Badge({ ok }) {
  return (
    <span className={`px-2 py-1 rounded text-sm ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? 'OK' : 'KO'}
    </span>
  )
}

export default function App() {
  const [health, setHealth] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [postResp, setPostResp] = useState(null)
  const [batchId, setBatchId] = useState('')
  const [getResp, setGetResp] = useState(null)

  useEffect(() => {
    getHealth().then(setHealth).catch(e => setErr(e.message))
  }, [])

  async function handleCreateImport() {
    setErr(''); setBusy(true); setGetResp(null)
    try {
      const data = await postImportExcel()
      setPostResp(data)
      if (data?.import_batch_id) setBatchId(String(data.import_batch_id))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleFetchReport() {
    if (!batchId) return
    setErr(''); setBusy(true)
    try {
      const data = await getImport(batchId)
      setGetResp(data)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold">Budget — Frontend (Lot 4)</h1>

        {/* Santé */}
        <section className="bg-white rounded-xl shadow p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Santé backend</h2>
            <Badge ok={health?.status === 'ok'} />
          </div>
          <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto">
            {JSON.stringify(health, null, 2)}
          </pre>
        </section>

        {/* Imports */}
        <section className="bg-white rounded-xl shadow p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Import Excel (stub compatible)</h2>
            {busy ? <span className="text-sm">⏳</span> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              onClick={handleCreateImport}
              disabled={busy}
            >
              Créer un import (POST /imports/excel)
            </button>

            <input
              className="border rounded px-3 py-2 w-48"
              placeholder="import_batch_id"
              value={batchId}
              onChange={e => setBatchId(e.target.value)}
            />

            <button
              className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={handleFetchReport}
              disabled={busy || !batchId}
            >
              Récupérer le rapport (GET /imports/:id)
            </button>
          </div>

          {err ? <p className="text-sm text-red-600">Erreur : {err}</p> : null}

          {postResp && (
            <div>
              <h3 className="font-medium">Réponse POST</h3>
              <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto">
                {JSON.stringify(postResp, null, 2)}
              </pre>
            </div>
          )}

          {getResp && (
            <div>
              <h3 className="font-medium">Rapport</h3>
              <div className="text-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="font-semibold">Totals</div>
                  <ul className="list-disc ms-5">
                    <li>parsed: {getResp.report?.totals?.parsed ?? '-'}</li>
                    <li>created: {getResp.report?.totals?.created ?? '-'}</li>
                  </ul>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="font-semibold">Ignored</div>
                  <ul className="list-disc ms-5">
                    <li>duplicates: {getResp.report?.ignored?.duplicates ?? '-'}</li>
                    <li>missing_account: {getResp.report?.ignored?.missing_account ?? '-'}</li>
                    <li>invalid: {getResp.report?.ignored?.invalid ?? '-'}</li>
                  </ul>
                </div>
              </div>
              <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto mt-3">
                {JSON.stringify(getResp, null, 2)}
              </pre>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
