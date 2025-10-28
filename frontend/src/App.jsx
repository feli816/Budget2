import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getHealth,
  postImportExcelStub,
  postImportExcelFile,
  getImportReport,
  getAccounts,
  getCategories,
  getTransactions,
  getRules,
  createRule,
  updateRule,
  deleteRule,
} from './api'

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

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium' }).format(new Date(value))
  } catch (e) {
    return String(value)
  }
}

function formatAmount(amount, currency = 'CHF') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '-'
  try {
    return new Intl.NumberFormat('fr-CH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch (e) {
    return `${amount.toFixed(2)} ${currency}`
  }
}

const categoryKindLabels = {
  income: 'Revenus',
  expense: 'Dépenses',
  transfer: 'Transferts',
}

function getDefaultRuleForm() {
  return {
    target_kind: 'income',
    category_id: '',
    keywords: '',
    priority: '0',
    enabled: true,
  }
}

function RulesTab({ categories }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dbDisabled, setDbDisabled] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [form, setForm] = useState(() => getDefaultRuleForm())
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  const categoryMap = useMemo(
    () => new Map(categories.map(cat => [String(cat.id), cat])),
    [categories],
  )

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getRules()
      setRules(Array.isArray(data) ? data : [])
      setDbDisabled(false)
    } catch (err) {
      const message = err?.message || String(err)
      const disabled = message.toLowerCase().includes('disable_db')
      setDbDisabled(disabled)
      setRules([])
      setError(disabled ? '' : message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const availableCategories = useMemo(
    () => categories.filter(cat => cat.kind === form.target_kind),
    [categories, form.target_kind],
  )

  function resetForm() {
    setForm(getDefaultRuleForm())
    setEditingRule(null)
    setFormError('')
  }

  function handleFormChange(key, value) {
    if (key === 'target_kind') {
      setForm(prev => {
        const matching = categories.some(
          cat => cat.kind === value && String(cat.id) === prev.category_id,
        )
        return {
          ...prev,
          target_kind: value,
          category_id: matching ? prev.category_id : '',
        }
      })
      return
    }
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleCreateClick() {
    resetForm()
    setShowForm(true)
  }

  function handleEdit(rule) {
    setEditingRule(rule)
    setForm({
      target_kind: rule.target_kind,
      category_id: rule.category_id != null ? String(rule.category_id) : '',
      keywords: Array.isArray(rule.keywords) ? rule.keywords.join(', ') : '',
      priority: String(rule.priority ?? 0),
      enabled: rule.enabled !== false,
    })
    setFormError('')
    setShowForm(true)
  }

  function handleCancelForm() {
    resetForm()
    setShowForm(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const categoryId = Number(form.category_id)
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setFormError('Sélectionnez une catégorie.')
      return
    }

    const priorityNumber = Number(form.priority)
    const priority = Number.isFinite(priorityNumber) ? Math.round(priorityNumber) : 0
    const keywords = form.keywords
      .split(/[,\n]/)
      .map(kw => kw.trim())
      .filter(Boolean)

    const payload = {
      target_kind: form.target_kind,
      category_id: categoryId,
      keywords,
      priority,
      enabled: form.enabled,
    }

    setSaving(true)
    try {
      if (editingRule) {
        await updateRule(editingRule.id, payload)
      } else {
        await createRule(payload)
      }
      await loadRules()
      resetForm()
      setShowForm(false)
    } catch (err) {
      setFormError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(rule) {
    setFormError('')
    setActionBusy(true)
    try {
      await updateRule(rule.id, { enabled: !rule.enabled })
      await loadRules()
    } catch (err) {
      setFormError(err?.message || String(err))
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDelete(rule) {
    if (!window.confirm('Supprimer cette règle ?')) return
    setFormError('')
    setActionBusy(true)
    try {
      await deleteRule(rule.id)
      await loadRules()
    } catch (err) {
      setFormError(err?.message || String(err))
    } finally {
      setActionBusy(false)
    }
  }

  const tableRows = useMemo(() => {
    return rules.map(rule => {
      const category = rule.category_id != null ? categoryMap.get(String(rule.category_id)) : null
      return [
        <span className="font-mono" key="id">#{rule.id}</span>,
        <span className="capitalize" key="kind">{categoryKindLabels[rule.target_kind] || rule.target_kind}</span>,
        <div className="space-y-0.5" key="category">
          <div className="font-medium">{category ? category.name : `ID ${rule.category_id}`}</div>
          <div className="text-xs text-gray-500">{categoryKindLabels[category?.kind] || category?.kind || '—'}</div>
        </div>,
        <div className="flex flex-wrap gap-1" key="keywords">
          {(rule.keywords || []).length
            ? rule.keywords.map((kw, index) => (
                <span
                  key={`${rule.id}-kw-${index}`}
                  className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
                >
                  {kw}
                </span>
              ))
            : <span className="text-sm text-gray-500">—</span>}
        </div>,
        <span className="font-semibold" key="priority">{rule.priority ?? 0}</span>,
        <span
          className={`font-medium ${rule.enabled ? 'text-emerald-600' : 'text-gray-500'}`}
          key="enabled"
        >
          {rule.enabled ? 'Oui' : 'Non'}
        </span>,
        <div className="flex flex-wrap gap-2" key="actions">
          <button
            type="button"
            onClick={() => handleEdit(rule)}
            className="px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-100"
            disabled={saving || actionBusy || dbDisabled}
          >
            Éditer
          </button>
          <button
            type="button"
            onClick={() => handleToggle(rule)}
            className="px-2 py-1 rounded border border-gray-300 text-xs hover:bg-gray-100"
            disabled={actionBusy || dbDisabled}
          >
            {rule.enabled ? 'Désactiver' : 'Activer'}
          </button>
          <button
            type="button"
            onClick={() => handleDelete(rule)}
            className="px-2 py-1 rounded border border-red-300 text-xs text-red-600 hover:bg-red-50"
            disabled={actionBusy || dbDisabled}
          >
            Supprimer
          </button>
        </div>,
      ]
    })
  }, [rules, categoryMap, saving, actionBusy, dbDisabled])

  return (
    <Card
      title="Règles"
      right={
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={loadRules}
            className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-100"
          >
            Actualiser
          </button>
          {loading ? <span className="text-gray-500">Chargement…</span> : null}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCreateClick}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={dbDisabled}
          >
            Créer une règle
          </button>
        </div>

        {dbDisabled ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            DB désactivée
          </p>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {showForm ? (
          <form onSubmit={handleSubmit} className="border rounded p-4 space-y-4 bg-gray-50">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm space-y-1">
                <span className="text-gray-600">Type de cible</span>
                <select
                  className="border rounded px-3 py-2"
                  value={form.target_kind}
                  onChange={e => handleFormChange('target_kind', e.target.value)}
                  disabled={saving}
                >
                  {Object.entries(categoryKindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1">
                <span className="text-gray-600">Catégorie</span>
                <select
                  className="border rounded px-3 py-2"
                  value={form.category_id}
                  onChange={e => handleFormChange('category_id', e.target.value)}
                  disabled={saving}
                >
                  <option value="">Sélectionner…</option>
                  {availableCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm space-y-1 md:col-span-2">
                <span className="text-gray-600">Mots-clés (séparés par des virgules ou retours à la ligne)</span>
                <textarea
                  className="border rounded px-3 py-2 h-24"
                  value={form.keywords}
                  onChange={e => handleFormChange('keywords', e.target.value)}
                  placeholder="ex: migros, coop"
                  disabled={saving}
                />
              </label>

              <label className="text-sm space-y-1">
                <span className="text-gray-600">Priorité</span>
                <input
                  type="number"
                  className="border rounded px-3 py-2"
                  value={form.priority}
                  onChange={e => handleFormChange('priority', e.target.value)}
                  disabled={saving}
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={e => handleFormChange('enabled', e.target.checked)}
                  disabled={saving}
                />
                <span>Activer la règle</span>
              </label>
            </div>

            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                disabled={saving}
              >
                {editingRule ? 'Mettre à jour' : 'Créer'}
              </button>
              <button
                type="button"
                onClick={handleCancelForm}
                className="px-4 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                disabled={saving}
              >
                Annuler
              </button>
            </div>
          </form>
        ) : null}

        <Table
          headers={['ID', 'Cible', 'Catégorie', 'Mots-clés', 'Priorité', 'Active', 'Actions']}
          rows={tableRows}
          emptyLabel={loading ? 'Chargement…' : 'Aucune règle'}
        />
      </div>
    </Card>
  )
}

export default function App() {
  const [health, setHealth] = useState(null)
  const [importErr, setImportErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [file, setFile] = useState(null)
  const [manualIban, setManualIban] = useState('')
  const [manualStartRow, setManualStartRow] = useState('')
  const uploadEnabled = import.meta.env.VITE_UPLOAD_ENABLED === '1'

  const [postResp, setPostResp] = useState(null)
  const [batchId, setBatchId] = useState('')
  const [report, setReport] = useState(null)

  const [accounts, setAccounts] = useState([])
  const [categories, setCategories] = useState([])
  const [transactions, setTransactions] = useState([])
  const [transactionsErr, setTransactionsErr] = useState('')
  const [transactionsMetaErr, setTransactionsMetaErr] = useState('')
  const [transactionsBusy, setTransactionsBusy] = useState(false)
  const [filters, setFilters] = useState({ accountId: '', categoryId: '', limit: '50' })
  const [activeTab, setActiveTab] = useState('dashboard')

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
    const controller = new AbortController()
    let active = true

    const query = {}
    if (filters.accountId) query.account_id = filters.accountId
    if (filters.categoryId) query.category_id = filters.categoryId
    const limitNumber = Number(filters.limit)
    if (!Number.isNaN(limitNumber) && limitNumber > 0) {
      query.limit = limitNumber
    }

    setTransactionsBusy(true)
    setTransactionsErr('')

    getTransactions(query, { signal: controller.signal })
      .then(data => {
        if (!active) return
        setTransactions(Array.isArray(data) ? data : [])
      })
      .catch(error => {
        if (!active || error.name === 'AbortError') return
        setTransactionsErr(error.message || String(error))
        setTransactions([])
      })
      .finally(() => {
        if (!active) return
        setTransactionsBusy(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [filters.accountId, filters.categoryId, filters.limit])

  async function handleCreateImport() {
    setImportErr('')
    setBusy(true)
    setReport(null)

    try {
      let data
      if (uploadEnabled && file) {
        // Upload réel
        if (!file.name.toLowerCase().endsWith('.xlsx')) {
          throw new Error('Un fichier .xlsx est attendu.')
        }
        data = await postImportExcelFile(file, {
          iban: manualIban.trim(),
          startRow: manualStartRow.trim(),
        })
      } else {
        // Fallback stub
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

  const accountById = useMemo(() => {
    return Object.fromEntries(accounts.map(acc => [acc.id, acc]))
  }, [accounts])

  const categoryById = useMemo(() => {
    return Object.fromEntries(categories.map(cat => [String(cat.id), cat]))
  }, [categories])

  const transactionsRows = useMemo(() => {
    return transactions.map(trx => {
      const account = accountById[trx.account_id]
      const category = trx.category_id != null ? categoryById[String(trx.category_id)] : null
      const amount = typeof trx.amount === 'number' ? trx.amount : Number(trx.amount)
      const amountClass = amount < 0 ? 'text-red-600' : 'text-emerald-600'

      return [
        <span className="whitespace-nowrap" key="date">{formatDate(trx.occurred_on)}</span>,
        <div className="space-y-1" key="desc">
          <div className="font-medium">{trx.description}</div>
          {trx.raw_description ? (
            <div className="text-xs text-gray-500 whitespace-pre-wrap">{trx.raw_description}</div>
          ) : null}
        </div>,
        <span className={`font-semibold ${amountClass}`} key="amount">
          {formatAmount(amount, trx.currency_code || account?.currency_code || 'CHF')}
        </span>,
        <div className="text-sm" key="meta">
          <div>{category ? `${category.name}` : 'Non catégorisé'}</div>
          <div className="text-xs text-gray-500">{account ? account.name : trx.account_id}</div>
        </div>,
        <span className="text-xs uppercase tracking-wide text-gray-500" key="status">
          {trx.status || 'real'}
        </span>,
      ]
    })
  }, [transactions, accountById, categoryById])

  const transactionsTotal = useMemo(() => {
    return transactions.reduce((sum, trx) => sum + Number(trx.amount || 0), 0)
  }, [transactions])

  const accountOptions = useMemo(() => {
    return accounts.map(acc => ({ value: acc.id, label: acc.name || acc.id }))
  }, [accounts])

  const categoryOptions = useMemo(() => {
    return categories.map(cat => ({
      value: String(cat.id),
      label: `${categoryKindLabels[cat.kind] || cat.kind} — ${cat.name}`,
    }))
  }, [categories])

  function handleFilterChange(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function handleResetFilters() {
    setFilters({ accountId: '', categoryId: '', limit: '50' })
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold">Budget — Frontend (Lot 6)</h1>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            Tableau de bord
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded ${
              activeTab === 'rules'
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            Règles
          </button>
        </div>

        {activeTab === 'dashboard' ? (
          <>
            <Card title="Santé backend" right={<Badge ok={health?.status === 'ok'} />}>
              <pre className="text-sm bg-gray-100 p-3 rounded overflow-auto">
                {JSON.stringify(health, null, 2)}
              </pre>
            </Card>

            <Card
              title="Transactions"
              right={
                <span className="text-sm px-2 py-1 rounded bg-amber-50 text-amber-700">
                  Liste temps-réel avec filtres
                </span>
              }
            >
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-4">
                  <label className="text-sm space-y-1">
                    <span className="text-gray-600">Compte</span>
                    <select
                      className="border rounded px-3 py-2 w-full"
                      value={filters.accountId}
                      onChange={e => handleFilterChange('accountId', e.target.value)}
                    >
                      <option value="">Tous</option>
                      {accountOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm space-y-1">
                    <span className="text-gray-600">Catégorie</span>
                    <select
                      className="border rounded px-3 py-2 w-full"
                      value={filters.categoryId}
                      onChange={e => handleFilterChange('categoryId', e.target.value)}
                    >
                      <option value="">Toutes</option>
                      {categoryOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm space-y-1">
                    <span className="text-gray-600">Limite</span>
                    <input
                      type="number"
                      min={1}
                      className="border rounded px-3 py-2 w-full"
                      value={filters.limit}
                      onChange={e => handleFilterChange('limit', e.target.value)}
                    />
                  </label>

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Réinitialiser
                    </button>
                    {transactionsBusy ? (
                      <span className="text-xs text-gray-500">Chargement…</span>
                    ) : null}
                  </div>
                </div>

                {transactionsMetaErr ? (
                  <p className="text-sm text-red-600">{transactionsMetaErr}</p>
                ) : null}
                {transactionsErr ? (
                  <p className="text-sm text-red-600">{transactionsErr}</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
                  <div>
                    {transactions.length} transaction{transactions.length > 1 ? 's' : ''}
                    {filters.accountId
                      ? ` · ${accountById[filters.accountId]?.name || filters.accountId}`
                      : ''}
                    {filters.categoryId
                      ? ` · ${categoryById[filters.categoryId]?.name || 'Catégorie inconnue'}`
                      : ''}
                  </div>
                  <div className={`font-semibold ${transactionsTotal < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    Total affiché : {formatAmount(transactionsTotal, 'CHF')}
                  </div>
                </div>

                <Table
                  headers={['Date', 'Description', 'Montant', 'Catégorie & Compte', 'Statut']}
                  rows={transactionsRows}
                  emptyLabel={transactionsBusy ? 'Chargement…' : 'Aucune transaction'}
                />
              </div>
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
                      type="text"
                      className="border rounded px-3 py-2 w-56"
                      placeholder="IBAN du compte"
                      value={manualIban}
                      onChange={e => setManualIban(e.target.value)}
                    />

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
                  </div>

                  {importErr ? <p className="text-sm text-red-600">Erreur : {importErr}</p> : null}

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
                  <KeyVal
                    k="ignored.total"
                    v={
                      (postResp?.report?.ignored?.duplicates ?? 0) +
                      (postResp?.report?.ignored?.missing_account ?? 0) +
                      (postResp?.report?.ignored?.invalid ?? 0)
                    }
                  />
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
          </>
        ) : (
          <RulesTab categories={categories} />
        )}
      </div>
    </div>
  )
}
