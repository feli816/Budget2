import { useCallback, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import {
  Badge,
  Card,
  KeyVal,
  Table,
  formatDate,
  formatAmount,
} from './components/ui'
import {
  getHealth,
  postImportExcelStub,
  postImportExcelFile,
  getImportReport,
  getImportCheckReport,
  getAccounts,
  getCategories,
  getImportSummary,
} from './api'
import GlobalReportView from './views/GlobalReportView.jsx'
import RulesView from './views/RulesView.jsx'
import AccountsView from './views/AccountsView.jsx'
import PersonsView from './views/PersonsView.jsx'

const categoryKindLabels = {
  income: 'Revenus',
  expense: 'Dépenses',
  transfer: 'Transferts',
}

function ImportReportView({ report }) {
  if (!report) return null

  const details = report.report || {}
  const totals = details.totals || {}
  const ignored = details.ignored || {}
  const accounts = Array.isArray(details.accounts) ? details.accounts : []
  const categories = Array.isArray(details.categories) ? details.categories : []
  const balances = details.balances || {}
  const expectedBalances = balances.expected || {}
  const actualBalances = balances.actual || {}

  const accountsRows = accounts.map(account => [
    <div key={`name-${account.id || account.iban || account.name}`} className="font-medium">
      {account.name || account.id || '-'}
      {account.iban ? (
        <div className="text-xs text-gray-500">{account.iban}</div>
      ) : null}
    </div>,
    <span key={`created-${account.id || account.iban || account.name}`}>{account.created ?? '-'}</span>,
  ])

  const categoriesRows = categories.map(category => [
    <div key={`cat-${category.id || category.name}`} className="font-medium">
      {category.name || category.id || '-'}
    </div>,
    <span key={`kind-${category.id || category.name}`} className="uppercase tracking-wide text-xs text-gray-600">
      {categoryKindLabels[category.kind] || category.kind || '-'}
    </span>,
    <span key={`count-${category.id || category.name}`}>{category.count ?? '-'}</span>,
  ])

  return (
    <div className="space-y-4">
      <Card
        title={`Rapport import #${report.id ?? '?'}`}
        right={<Badge ok={(report.status || '').toLowerCase() === 'completed'} />}
      >
        <div className="space-y-2">
          <KeyVal k="Statut" v={report.status || '-'} />
          <KeyVal k="Source" v={report.source || '-'} />
          <KeyVal k="Fichier original" v={report.original_filename || '-'} />
          <KeyVal k="Lignes importées" v={report.rows_count ?? '-'} />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Totals">
          <div className="space-y-2">
            <KeyVal k="Transactions analysées" v={totals.parsed ?? '-'} />
            <KeyVal k="Transactions créées" v={totals.created ?? '-'} />
            <KeyVal k="Transactions ignorées" v={totals.ignored ?? '-'} />
          </div>
        </Card>

        <Card title="Ignorés">
          <div className="space-y-2">
            <KeyVal k="Doublons" v={ignored.duplicates ?? '-'} />
            <KeyVal k="Compte introuvable" v={ignored.missing_account ?? '-'} />
            <KeyVal k="Invalides" v={ignored.invalid ?? '-'} />
          </div>
        </Card>
      </div>

      <Card title="Comptes">
        <Table
          headers={["Compte", "Transactions créées"]}
          rows={accountsRows}
          emptyLabel="Aucun compte impacté"
        />
      </Card>

      <Card title="Catégories">
        <Table
          headers={["Catégorie", "Type", "Transactions"]}
          rows={categoriesRows}
          emptyLabel="Aucune catégorie utilisée"
        />
      </Card>

      <Card title="Balances">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-600">Attendu</h3>
            <KeyVal k="Solde initial" v={formatAmount(expectedBalances.start)} />
            <KeyVal k="Solde final" v={formatAmount(expectedBalances.end)} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-600">Réel</h3>
            <KeyVal k="Solde initial" v={formatAmount(actualBalances.start)} />
            <KeyVal k="Solde final" v={formatAmount(actualBalances.end)} />
          </div>
        </div>
      </Card>
    </div>
  )
}

function ImportCheckReportTable({ rows }) {
  const safeRows = Array.isArray(rows) ? rows : []

  const statusStyles = {
    OK: { className: 'bg-green-100 text-green-700', icon: '✅' },
    UNCATEGORIZED: { className: 'bg-amber-100 text-amber-700', icon: '⚠️' },
    CHECK: { className: 'bg-blue-100 text-blue-700', icon: '🔁' },
    FALLBACK: { className: 'bg-gray-100 text-gray-700', icon: '🟦' },
  }

  const tableRows = safeRows.map((entry, index) => {
    const amountNumber = typeof entry?.amount === 'number' ? entry.amount : Number(entry?.amount)
    const hasValidAmount = Number.isFinite(amountNumber)
    const amount = hasValidAmount ? amountNumber : null
    const amountClass = amount == null ? 'text-gray-500' : amount < 0 ? 'text-red-600' : 'text-emerald-600'
    const isFallbackCategory =
      typeof entry?.category === 'string' && entry.category.trim().toLowerCase() === 'divers'
    const rawStatus = isFallbackCategory ? 'FALLBACK' : entry?.status
    const statusKey = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : 'CHECK'
    const statusInfo = statusStyles[statusKey] || { className: 'bg-gray-100 text-gray-600', icon: 'ℹ️' }

    return [
      <span key={`row-${index}`}>{entry?.row ?? index + 1}</span>,
      <div key={`desc-${index}`} className="space-y-1">
        <div className="font-medium">{entry?.description || '-'}</div>
        {entry?.date ? (
          <div className="text-xs text-gray-500">{formatDate(entry.date)}</div>
        ) : null}
      </div>,
      <span key={`amount-${index}`} className={`font-semibold ${amountClass}`}>
        {amount == null ? '-' : formatAmount(amount)}
      </span>,
      <span key={`cat-${index}`}>{entry?.category || '-'}</span>,
      <span key={`type-${index}`} className="uppercase text-xs tracking-wide text-gray-600">
        {entry?.type ? categoryKindLabels[entry.type] || entry.type : '-'}
      </span>,
      <div key={`account-${index}`} className="space-y-1">
        <div>{entry?.account || '-'}</div>
        {entry?.iban ? <div className="text-xs text-gray-500 font-mono">{entry.iban}</div> : null}
      </div>,
      <span key={`rule-${index}`} className="text-xs text-gray-600">
        {entry?.rule || '-'}
      </span>,
      <span
        key={`status-${index}`}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold ${statusInfo.className}`}
      >
        <span>{statusInfo.icon}</span>
        <span>{statusKey}</span>
      </span>,
    ]
  })

  return (
    <Card title="Rapport de contrôle des classifications">
      <Table
        headers={["Ligne", "Description", "Montant", "Catégorie", "Type", "Compte", "Règle", "Statut"]}
        rows={tableRows}
        emptyLabel="Aucune transaction à afficher"
      />
    </Card>
  )
}

function ImportsDashboard() {
  const [health, setHealth] = useState(null)
  const [importErr, setImportErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [file, setFile] = useState(null)
  const [manualIban, setManualIban] = useState('')
  const [manualStartRow, setManualStartRow] = useState('')

  const [postResp, setPostResp] = useState(null)
  const [batchId, setBatchId] = useState('')
  const [report, setReport] = useState(null)
  const [importSummary, setImportSummary] = useState(null)
  const [checkReport, setCheckReport] = useState(null)

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [transactionsErr, setTransactionsErr] = useState('')
  const [transactionsMetaErr, setTransactionsMetaErr] = useState('')
  const [transactionsBusy, setTransactionsBusy] = useState(false)
  const [filters, setFilters] = useState({ accountId: '', categoryId: '', limit: '50' })

  useEffect(() => {
    try {
      const raw = localStorage.getItem('lastImport')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed.batchId) setBatchId(String(parsed.batchId))
      if (parsed.manualIban) setManualIban(parsed.manualIban)
      if (parsed.manualStartRow) setManualStartRow(String(parsed.manualStartRow))
      if (parsed.fileName) setFile({ name: parsed.fileName })
      if (Object.prototype.hasOwnProperty.call(parsed, 'report')) {
        setReport(parsed.report ?? null)
      }
      if (Object.prototype.hasOwnProperty.call(parsed, 'checkReport')) {
        if (Array.isArray(parsed.checkReport)) {
          setCheckReport(parsed.checkReport)
        } else if (parsed.checkReport === null) {
          setCheckReport(null)
        }
      }
    } catch (error) {
      console.warn('Impossible de restaurer le dernier import', error)
    }
  }, [])

  useEffect(() => {
    getHealth().then(setHealth).catch(e => setImportErr(e.message))
  }, [])

  useEffect(() => {
    let active = true
    async function loadMeta() {
      try {
        const [accs, cats] = await Promise.all([getAccounts(), getCategories()])
        if (!active) return
        setAccounts(accs)
        setCategories(cats)
      } catch (error) {
        if (!active) return
        setTransactionsMetaErr(error.message || String(error))
      }
    }
    loadMeta()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadSummary() {
      try {
        const data = await getImportSummary()
        if (!active) return
        setImportSummary(data || null)
      } catch (error) {
        console.error('Erreur chargement import summary:', error)
        if (!active) return
        setImportSummary(null)
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [])

  const uploadEnabled =
    health?.ENABLE_UPLOAD === true && health?.ENABLE_XLSX === true && health?.DISABLE_DB === false

  const fileName = file?.name ?? ''
  const isFileInstance = typeof File !== 'undefined' && file instanceof File
  const isCachedFile = Boolean(file) && !isFileInstance

  useEffect(() => {
    if (!batchId) return
    try {
      const payload = {
        batchId,
        manualIban,
        manualStartRow,
        fileName: fileName || null,
        report: report ?? null,
        checkReport: Array.isArray(checkReport) ? checkReport : null,
      }
      localStorage.setItem('lastImport', JSON.stringify(payload))
    } catch (error) {
      console.warn("Impossible d'enregistrer le dernier import", error)
    }
  }, [batchId, manualIban, manualStartRow, fileName, report, checkReport])

  const handleResetImportState = useCallback(() => {
    try {
      localStorage.removeItem('lastImport')
    } catch (error) {
      console.warn("Impossible de nettoyer l'état du dernier import", error)
    }
    window.location.reload()
  }, [])

  async function handleCreateImport() {
    setImportErr('')
    setBusy(true)
    setReport(null)
    setCheckReport(null)

    try {
      let data
      if (uploadEnabled) {
        if (!isFileInstance) {
          throw new Error('Veuillez sélectionner à nouveau votre fichier Excel avant de relancer un import.')
        }
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
          throw new Error('Un fichier .xlsx est attendu.')
        }
        data = await postImportExcelFile(file, {
          iban: manualIban.trim(),
          startRow: manualStartRow.trim(),
        })
      } else {
        data = await postImportExcelStub({
          iban: manualIban.trim(),
          startRow: manualStartRow.trim(),
        })
      }
      setPostResp(data)
      if (data?.import_batch_id) {
        setBatchId(String(data.import_batch_id))
      }
    } catch (e) {
      setImportErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleFetchReport() {
    if (!batchId) return
    setImportErr('')
    setBusy(true)
    try {
      const data = await getImportReport(batchId)
      setReport(data)
    } catch (e) {
      setImportErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckReport() {
    if (!batchId) {
      alert('Aucun import sélectionné')
      return
    }
    setImportErr('')
    setBusy(true)
    try {
      const data = await getImportCheckReport(batchId)
      setCheckReport(Array.isArray(data) ? data : [])
    } catch (e) {
      setImportErr(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const importErrors = useMemo(() => {
    const summary = importSummary?.summary ?? importSummary
    if (!summary || !Array.isArray(summary.import_errors)) {
      return []
    }
    return summary.import_errors.filter(
      err => err.status === 'error' || (typeof err.message === 'object' && err.message?.error)
    )
  }, [importSummary])

  const summaryAccounts = useMemo(() => {
    const summary = importSummary?.summary ?? importSummary
    if (!summary || !Array.isArray(summary.accounts)) {
      return []
    }
    return summary.accounts
  }, [importSummary])

  const summaryCategories = useMemo(() => {
    const summary = importSummary?.summary ?? importSummary
    if (!summary || !Array.isArray(summary.categories)) {
      return []
    }
    return summary.categories
  }, [importSummary])

  const totalCreatedAllAccounts = useMemo(() => {
    return summaryAccounts.reduce((sum, acc) => sum + (acc.created ?? 0), 0)
  }, [summaryAccounts])

  const totalCategoryTransactions = useMemo(() => {
    return summaryCategories.reduce((sum, cat) => sum + (cat.count ?? 0), 0)
  }, [summaryCategories])

  const transactionsRows = useMemo(() => {
    return transactions.map(trx => {
      const amount = typeof trx.amount === 'number' ? trx.amount : Number(trx.amount)
      const amountClass = amount < 0 ? 'text-red-600' : 'text-emerald-600'

      return [
        <span key="date">{formatDate(trx.occurred_on)}</span>,
        <span key="desc">{trx.description}</span>,
        <span className={`font-semibold ${amountClass}`} key="amount">{formatAmount(amount)}</span>,
        <span key="status">{trx.status || 'real'}</span>,
      ]
    })
  }, [transactions])

  const formatErrorMessage = message => {
    if (message == null) {
      return ''
    }
    if (typeof message === 'object') {
      try {
        return JSON.stringify(message, null, 2)
      } catch (error) {
        return String(message)
      }
    }
    return String(message)
  }

  return (
    <div className="space-y-6">
      <Card title="Santé backend" right={<Badge ok={health?.status === 'ok'} />}>
        <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto">
          {JSON.stringify(health, null, 2)}
        </pre>
      </Card>

      <Card
        title="Import Excel"
        right={
          <span className="text-sm px-2 py-1 rounded bg-indigo-50 text-indigo-700">
            {uploadEnabled
              ? 'Upload réel activé'
              : 'Mode stub (pas de fichier requis)'}
          </span>
        }
      >
        <div className="space-y-3">
          {uploadEnabled && (
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Fichier Excel
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              {fileName ? (
                <p className="mt-1 text-xs text-gray-500">
                  Fichier sélectionné : <span className="font-medium">{fileName}</span>
                  {isCachedFile ? ' (à re-sélectionner pour un nouvel import)' : ''}
                </p>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCreateImport}
              disabled={busy || (uploadEnabled && !isFileInstance)}
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Créer un import (POST /imports/excel)
            </button>

            <div className="flex flex-col gap-1">
              <label htmlFor="import-iban-select" className="text-sm text-gray-600">
                IBAN du compte
              </label>
              <select
                id="import-iban-select"
                className="border rounded px-3 py-2 w-56"
                value={manualIban}
                onChange={e => setManualIban(e.target.value)}
              >
                <option value="">-- Sélectionner un compte existant --</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.iban}>
                    {acc.iban} — {acc.name || 'Compte sans nom'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500">Ou saisir un nouvel IBAN :</p>
              <input
                type="text"
                className="border rounded px-3 py-2 w-56"
                placeholder="Saisir un nouvel IBAN"
                value={manualIban}
                onChange={e => setManualIban(e.target.value)}
              />
            </div>

            <input
              type="number"
              min="1"
              className="border rounded px-3 py-2 w-40"
              placeholder="Ligne de début"
              value={manualStartRow}
              onChange={e => setManualStartRow(e.target.value)}
            />

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

            <button
              onClick={handleCheckReport}
              disabled={busy || !batchId}
              className="px-4 py-2 rounded bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
            >
              Voir le rapport de contrôle
            </button>

            <button
              onClick={handleResetImportState}
              className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
            >
              Réinitialiser l'état de l'import
            </button>
          </div>

          {importErr && <p className="text-sm text-red-600">Erreur : {importErr}</p>}
        </div>
      </Card>

      {importErrors.length > 0 && (
        <Card title="Erreurs d'import">
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 text-left">ID Import</th>
                  <th className="border px-2 py-1 text-left">Nom du fichier</th>
                  <th className="border px-2 py-1 text-left">Statut</th>
                  <th className="border px-2 py-1 text-left">Message d'erreur</th>
                </tr>
              </thead>
              <tbody>
                {importErrors.map(err => (
                  <tr key={err.id || `${err.filename}-${err.status}`} className="align-top">
                    <td className="border px-2 py-1 text-center whitespace-nowrap">{err.id ?? '-'}</td>
                    <td className="border px-2 py-1">{err.filename || '-'}</td>
                    <td className="border px-2 py-1">{err.status || '-'}</td>
                    <td className="border px-2 py-1 font-mono text-xs whitespace-pre-wrap">
                      {formatErrorMessage(err.message)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {summaryAccounts.length > 0 && (
        <Card title="Imports par compte">
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 text-left">ID</th>
                  <th className="border px-2 py-1 text-left">Nom du compte</th>
                  <th className="border px-2 py-1 text-left">IBAN</th>
                  <th className="border px-2 py-1 text-right">Transactions créées</th>
                </tr>
              </thead>
              <tbody>
                {summaryAccounts.map(acc => {
                  const key = acc.id ?? acc.iban ?? acc.name ?? JSON.stringify(acc)
                  return (
                    <tr key={key}>
                      <td className="border px-2 py-1">{acc.id ?? '-'}</td>
                      <td className="border px-2 py-1">{acc.name ?? '-'}</td>
                      <td className="border px-2 py-1 font-mono">{acc.iban ?? '-'}</td>
                      <td className="border px-2 py-1 text-right">{acc.created ?? '-'}</td>
                    </tr>
                  )
                })}
                <tr className="font-semibold bg-gray-50">
                  <td colSpan={3} className="border px-2 py-1 text-right">
                    Total global
                  </td>
                  <td className="border px-2 py-1 text-right">{totalCreatedAllAccounts}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {summaryCategories.length > 0 && (
        <Card title="Imports par catégorie">
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-300 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 text-left">ID</th>
                  <th className="border px-2 py-1 text-left">Nom de la catégorie</th>
                  <th className="border px-2 py-1 text-left">Type</th>
                  <th className="border px-2 py-1 text-right">Transactions</th>
                </tr>
              </thead>
              <tbody>
                {summaryCategories.map(cat => (
                  <tr key={cat.id}>
                    <td className="border px-2 py-1">{cat.id}</td>
                    <td className="border px-2 py-1">{cat.name}</td>
                    <td className="border px-2 py-1">{cat.kind}</td>
                    <td className="border px-2 py-1 text-right">{cat.count}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-gray-50">
                  <td colSpan={3} className="border px-2 py-1 text-right">
                    Total global
                  </td>
                  <td className="border px-2 py-1 text-right">{totalCategoryTransactions}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {report && (
        <ImportReportView report={report} />
      )}

      {checkReport !== null && (
        <ImportCheckReportTable rows={checkReport} />
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">Budget — Frontend (Lot 6)</h1>
              <p className="text-sm text-gray-600">Interface de démonstration</p>
            </div>
            <nav className="flex gap-2">
              <NavLink
                to="/imports"
                end
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 border border-blue-100 hover:bg-blue-50'
                  }`
                }
              >
                Imports
              </NavLink>
              <NavLink
                to="/imports/summary"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 border border-blue-100 hover:bg-blue-50'
                  }`
                }
              >
                Résumé global
              </NavLink>
              <NavLink
                to="/rules"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 border border-blue-100 hover:bg-blue-50'
                  }`
                }
              >
                Règles
              </NavLink>
              <NavLink
                to="/accounts"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 border border-blue-100 hover:bg-blue-50'
                  }`
                }
              >
                Comptes
              </NavLink>
              <NavLink
                to="/persons"
                className={({ isActive }) =>
                  `px-3 py-2 rounded-md text-sm font-medium ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-blue-600 border border-blue-100 hover:bg-blue-50'
                  }`
                }
              >
                Personnes
              </NavLink>
            </nav>
          </header>

          <Routes>
            <Route path="/" element={<ImportsDashboard />} />
            <Route path="/imports" element={<ImportsDashboard />} />
            <Route path="/imports/summary" element={<GlobalReportView />} />
            <Route path="/rules" element={<RulesView />} />
            <Route path="/accounts" element={<AccountsView />} />
            <Route path="/persons" element={<PersonsView />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
