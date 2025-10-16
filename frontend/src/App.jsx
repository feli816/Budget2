import { useEffect, useMemo, useState } from 'react'
import { getHealth, postImportExcelStub, postImportExcelFile, getImportReport } from './api'

function Badge({ ok }) {
  return (
    <span className={`px-2 py-1 rounded text-sm ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? 'OK' : 'KO'}
    </span>
  )
}

function Card({ title, children, right }) {
  return (
    <section className="bg-white rounded-xl shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {right || null}
      </div>
      {children}
    </section>
  )
}

function KeyVal({ k, v }) {
  return (
    <div className="flex gap-2 text-sm">
      <div className="w-40 text-gray-600">{k}</div>
      <div className="font-medium">{v ?? '-'}</div>
    </div>
  )
}

function Table({ headers, rows, emptyLabel = 'Aucune donnée' }) {
  return (
    <div className="overflow-auto border rounded">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="text-left px-3 py-2 font-semibold text-gray-700">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td className="px-3 py-2 text-gray-500" colSpan={headers.length}>{emptyLabel}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => (<td key={j} className="px-3 py-2">{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [file, setFile] = useState(null)
  const uploadEnabled = import.meta.env.VITE_UPLOAD_ENABLED === '1'

  const [postResp, setPostResp] = useState(null)
  const [batchId, setBatchId] = useState('')
  const [report, setReport] = useState(null)

  useEffect(() => {
    getHealth().then(setHealth).catch(e => setErr(e.message))
  }, [])

  async function handleCreateImport() {
    setErr('')
    setBusy(true)
    setReport(null)

    try {
      let data
      if (uploadEnabled && file) {
        // Upload réel
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
          throw new Error('Un fichier .xlsx est attendu.')
        }
        data = await postImportExcelFile(file)
      } else {
        // Fallback stub
        data = await postImportExcelStub()
      }
      setPostResp(data)
      if (data?.import_batch_id) {
        setBatchId(String(data.import_batch_id))
      }
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleFetchReport() {
    if (!batchId) return
    setErr('')
    setBusy(true)
    try {
      const data = await getImportReport(batchId)
      setReport(data)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const categoriesRows = useMemo(() => {
    const cats = report?.report?.categories || []
    return cats.map(c => [c.name, c.kind, c.count])
  }, [report])

  const accountsRows = useMemo(() => {
    const accs = report?.report?.accounts || []
    return accs.map(a => [a.name || '-', a.iban || '-', a.created ?? '-'])
  }, [report])

  const totals = report?.report?.totals || {}
  const ignored = report?.report?.ignored || {}
  const balances = report?.report?.balances || {}

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold">Budget — Frontend (Lot 5)</h1>

        <Card title="Santé backend" right={<Badge ok={health?.status === 'ok'} />}>
          <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto">
            {JSON.stringify(health, null, 2)}
          </pre>
        </Card>

        <Card
          title="Import Excel"
          right={<span className="text-sm px-2 py-1 rounded bg-indigo-50 text-indigo-700">
            {uploadEnabled ? 'Upload réel (si backend ENABLE_UPLOAD/ENABLE_XLSX)' : 'Mode stub (pas de fichier requis)'}
          </span>}
        >
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              {uploadEnabled && (
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleCreateImport}
                  disabled={busy || (uploadEnabled && !file)}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
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
                  onClick={handleFetchReport}
                  disabled={busy || !batchId}
                  className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Récupérer le rapport (GET /imports/:id)
                </button>
              </div>

              {err ? <p className="text-sm text-red-600">Erreur : {err}</p> : null}

              {postResp && (
                <div className="space-y-2">
                  <h3 className="font-medium">Réponse POST</h3>
                  <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto">
                    {JSON.stringify(postResp, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Résumé instantané */}
            <div className="bg-gray-50 rounded p-3 h-max">
              <div className="font-semibold mb-2">Résumé</div>
              <KeyVal k="import_batch_id" v={postResp?.import_batch_id} />
              <KeyVal k="totals.parsed" v={postResp?.report?.totals?.parsed} />
              <KeyVal k="totals.created" v={postResp?.report?.totals?.created} />
              <KeyVal k="ignored.total" v={
                (postResp?.report?.ignored?.duplicates ?? 0) +
                (postResp?.report?.ignored?.missing_account ?? 0) +
                (postResp?.report?.ignored?.invalid ?? 0)
              } />
            </div>
          </div>
        </Card>

        {report && (
          <Card title="Rapport d'import">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-gray-50 p-3 rounded">
                <div className="font-semibold mb-2">Totals</div>
                <ul className="list-disc ms-5 text-sm">
                  <li>parsed: {totals.parsed ?? '-'}</li>
                  <li>created: {totals.created ?? '-'}</li>
                </ul>
              </div>

              <div className="bg-gray-50 p-3 rounded">
                <div className="font-semibold mb-2">Ignored</div>
                <ul className="list-disc ms-5 text-sm">
                  <li>duplicates: {ignored.duplicates ?? '-'}</li>
                  <li>missing_account: {ignored.missing_account ?? '-'}</li>
                  <li>invalid: {ignored.invalid ?? '-'}</li>
                </ul>
              </div>

              <div className="bg-gray-50 p-3 rounded md:col-span-2">
                <div className="font-semibold mb-2">Categories</div>
                <Table
                  headers={['Name', 'Kind', 'Count']}
                  rows={(categoriesRows || []).sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0))}
                  emptyLabel="Aucune catégorie"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded md:col-span-2">
                <div className="font-semibold mb-2">Accounts</div>
                <Table
                  headers={['Name', 'IBAN', 'Created']}
                  rows={accountsRows || []}
                  emptyLabel="Aucun compte"
                />
              </div>

              <div className="bg-gray-50 p-3 rounded md:col-span-2">
                <div className="font-semibold mb-2">Balances</div>
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="font-medium mb-1">Expected</div>
                    <KeyVal k="start" v={balances?.expected?.start} />
                    <KeyVal k="end" v={balances?.expected?.end} />
                  </div>
                  <div>
                    <div className="font-medium mb-1">Actual</div>
                    <KeyVal k="start" v={balances?.actual?.start} />
                    <KeyVal k="end" v={balances?.actual?.end} />
                  </div>
                </div>
              </div>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer select-none text-sm text-gray-700">Voir le JSON brut</summary>
              <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto mt-2">
                {JSON.stringify(report, null, 2)}
              </pre>
            </details>
          </Card>
        )}
      </div>
    </div>
  )
}
