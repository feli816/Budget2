import { useEffect, useMemo, useState } from 'react'
import { Card, KeyVal, Table, formatAmount } from '../components/ui'
import { getImportSummary } from '../api'

const categoryKindLabels = {
  income: 'Revenus',
  expense: 'Dépenses',
  transfer: 'Transferts',
}

const totalsLabels = {
  imports_count: 'Imports traités',
  transactions_total: 'Transactions analysées',
  transactions_created: 'Transactions créées',
  transactions_ignored: 'Transactions ignorées',
}

export default function GlobalReportView() {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const handleExport = () => {
    const url = 'http://localhost:3000/imports/summary/export';
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    let active = true

    async function loadSummary() {
      setLoading(true)
      setError('')
      try {
        const data = await getImportSummary()
        if (!active) return
        setSummary(data || null)
      } catch (err) {
        if (!active) return
        setError(err.message || String(err))
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [])

  const totals = useMemo(() => {
    if (!summary) return []
    const entries = [
      ['imports_count', summary.imports_count],
      ['transactions_total', summary.transactions_total],
      ['transactions_created', summary.transactions_created],
      ['transactions_ignored', summary.transactions_ignored],
    ]
    return entries
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        key,
        label: totalsLabels[key] || key,
        value,
      }))
  }, [summary])

  const accounts = Array.isArray(summary?.accounts) ? summary.accounts : []
  const categories = Array.isArray(summary?.categories) ? summary.categories : []
  const actualBalances = summary?.balances?.actual || {}

  const accountRows = accounts.map(account => [
    <div key={`account-${account.id || account.name || account.iban}`} className="font-medium">
      {account.name || account.id || '-'}
      {account.iban ? (
        <div className="text-xs text-gray-500">{account.iban}</div>
      ) : null}
    </div>,
    <span key={`count-${account.id || account.name}`}>{account.created ?? '-'}</span>,
  ])

  const categoryRows = categories.map(category => [
    <div key={`category-${category.id || category.name}`} className="font-medium">
      {category.name || category.id || '-'}
    </div>,
    <span key={`kind-${category.id || category.name}`} className="uppercase tracking-wide text-xs text-gray-600">
      {categoryKindLabels[category.kind] || category.kind || '-'}
    </span>,
    <span key={`count-${category.id || category.name}`}>{category.count ?? '-'}</span>,
  ])

  return (
    <div className="space-y-6">
      <Card
        title="Résumé global des imports"
        right={(
          <button
            type="button"
            onClick={handleExport}
            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Exporter (.xlsx)
          </button>
        )}
      >
        {loading ? (
          <p className="text-sm text-gray-600">Chargement du résumé...</p>
        ) : error ? (
          <p className="text-sm text-red-600">Erreur : {error}</p>
        ) : totals.length === 0 ? (
          <p className="text-sm text-gray-600">Aucune donnée de résumé disponible.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {totals.map(item => (
              <KeyVal key={item.key} k={item.label} v={item.value ?? '-'} />
            ))}
          </div>
        )}
      </Card>

      <Card title="Comptes">
        <Table
          headers={["Compte", "Transactions créées"]}
          rows={accountRows}
          emptyLabel={loading ? 'Chargement...' : 'Aucun compte importé'}
        />
      </Card>

      <Card title="Catégories">
        <Table
          headers={["Catégorie", "Type", "Transactions"]}
          rows={categoryRows}
          emptyLabel={loading ? 'Chargement...' : 'Aucune catégorie utilisée'}
        />
      </Card>

      <Card title="Balances">
        {loading ? (
          <p className="text-sm text-gray-600">Chargement...</p>
        ) : (
          <div className="space-y-2">
            <KeyVal k="Solde initial" v={formatAmount(actualBalances.start)} />
            <KeyVal k="Solde final" v={formatAmount(actualBalances.end)} />
          </div>
        )}
      </Card>
    </div>
  )
}
