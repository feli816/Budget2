import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Table, formatAmount } from '../components/ui'
import { createAccount, deleteAccount, getAccounts, updateAccount } from '../api'

function normalizeCurrency(value) {
  if (!value) return 'CHF'
  return String(value).trim().slice(0, 3).toUpperCase()
}

function parseOpeningBalance(value) {
  if (value === '' || value === null || value === undefined) return 0
  const numberValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numberValue)) {
    throw new Error('Veuillez renseigner un solde initial valide.')
  }
  return numberValue
}

function deriveStatus(account) {
  const status = typeof account?.status === 'string' ? account.status.toLowerCase() : null
  if (status === 'inactive' || status === 'disabled' || status === 'archived') {
    return { label: 'Inactif', active: false }
  }
  if (status === 'active') {
    return { label: 'Actif', active: true }
  }
  if (account?.active === false) {
    return { label: 'Inactif', active: false }
  }
  if (account?.archived_at || account?.closed_at || account?.disabled_at) {
    return { label: 'Inactif', active: false }
  }
  return { label: 'Actif', active: true }
}

function getInitialOpeningBalance(initialAccount) {
  if (!initialAccount) return '0'
  if (initialAccount.opening_balance !== undefined && initialAccount.opening_balance !== null) {
    return String(initialAccount.opening_balance)
  }
  return ''
}

function AccountForm({ initialAccount, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    name: initialAccount?.name ?? '',
    iban: initialAccount?.iban ?? '',
    currency_code: normalizeCurrency(initialAccount?.currency_code ?? 'CHF'),
    opening_balance: getInitialOpeningBalance(initialAccount),
    owner_person_id: initialAccount?.owner_person_id ?? '',
  })
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({
      name: initialAccount?.name ?? '',
      iban: initialAccount?.iban ?? '',
      currency_code: normalizeCurrency(initialAccount?.currency_code ?? 'CHF'),
      opening_balance: getInitialOpeningBalance(initialAccount),
      owner_person_id: initialAccount?.owner_person_id ?? '',
    })
    setError('')
  }, [initialAccount])

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    const trimmedName = form.name.trim()
    if (!trimmedName) {
      setError('Le nom du compte est obligatoire.')
      return
    }

    const trimmedIban = form.iban.trim()
    if (!trimmedIban) {
      setError("L'IBAN est obligatoire.")
      return
    }

    const normalizedCurrency = normalizeCurrency(form.currency_code)
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setError('La devise doit être un code ISO à 3 lettres.')
      return
    }

    const payload = {
      name: trimmedName,
      iban: trimmedIban,
      currency_code: normalizedCurrency,
    }

    const includeOpeningBalance = !initialAccount || form.opening_balance !== ''
    if (includeOpeningBalance) {
      let openingBalance
      try {
        openingBalance = parseOpeningBalance(form.opening_balance)
      } catch (err) {
        setError(err.message || String(err))
        return
      }
      payload.opening_balance = openingBalance
    }

    const ownerId = form.owner_person_id.trim()
    if (ownerId) {
      if (/^-?\d+$/.test(ownerId)) {
        payload.owner_person_id = Number(ownerId)
      } else {
        payload.owner_person_id = ownerId
      }
    }

    try {
      await onSubmit(payload)
    } catch (err) {
      setError(err.message || String(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Nom du compte</span>
          <input
            type="text"
            value={form.name}
            onChange={event => updateField('name', event.target.value)}
            className="border rounded px-3 py-2"
            placeholder="Compte courant"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">IBAN</span>
          <input
            type="text"
            value={form.iban}
            onChange={event => updateField('iban', event.target.value)}
            className="border rounded px-3 py-2"
            placeholder="CH00 0000 0000 0000"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Devise</span>
          <input
            type="text"
            value={form.currency_code}
            onChange={event => updateField('currency_code', event.target.value)}
            className="border rounded px-3 py-2 uppercase"
            maxLength={3}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Solde initial</span>
          <input
            type="number"
            step="0.01"
            value={form.opening_balance}
            onChange={event => updateField('opening_balance', event.target.value)}
            className="border rounded px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="text-gray-600">Propriétaire (ID optionnel)</span>
          <input
            type="text"
            value={form.owner_person_id}
            onChange={event => updateField('owner_person_id', event.target.value)}
            className="border rounded px-3 py-2"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
          disabled={submitting}
        >
          Annuler
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          disabled={submitting}
        >
          Enregistrer
        </button>
      </div>
    </form>
  )
}

export default function AccountsView() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rowBusyId, setRowBusyId] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAccounts()
      const list = Array.isArray(data) ? data : []
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setAccounts(list)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  async function handleCreate(payload) {
    setFormSubmitting(true)
    try {
      await createAccount(payload)
      setShowCreateForm(false)
      await loadAccounts()
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleUpdate(accountId, payload) {
    setFormSubmitting(true)
    try {
      await updateAccount(accountId, payload)
      setEditingAccount(null)
      await loadAccounts()
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDelete(accountId) {
    if (!window.confirm('Supprimer ce compte ?')) {
      return
    }
    setRowBusyId(accountId)
    setError('')
    try {
      await deleteAccount(accountId)
      await loadAccounts()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setRowBusyId(null)
    }
  }

  const tableRows = useMemo(() => {
    return accounts.map(account => {
      const status = deriveStatus(account)
      const disableActions = rowBusyId !== null || formSubmitting
      const hasId = Boolean(account?.id)
      return [
        <span key={`name-${account.id}`} className="font-medium text-gray-800">
          {account.name || account.id || '-'}
        </span>,
        <span key={`iban-${account.id}`} className="text-sm text-gray-600">
          {account.iban || '—'}
        </span>,
        <span key={`currency-${account.id}`} className="uppercase text-xs text-gray-600 font-semibold">
          {account.currency_code || 'CHF'}
        </span>,
        <span key={`balance-${account.id}`} className="text-sm text-gray-700">
          {account.opening_balance !== undefined && account.opening_balance !== null
            ? formatAmount(Number(account.opening_balance), account.currency_code || 'CHF')
            : '—'}
        </span>,
        <span key={`owner-${account.id}`} className="text-sm text-gray-600">
          {account.owner_person_id || '—'}
        </span>,
        <span
          key={`status-${account.id}`}
          className={`text-sm font-medium ${status.active ? 'text-emerald-600' : 'text-gray-500'}`}
        >
          {status.label}
        </span>,
        <div key={`actions-${account.id}`} className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingAccount(account)
              setShowCreateForm(false)
            }}
            className="px-3 py-1 rounded-full border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
            disabled={disableActions}
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={() => {
              if (hasId) {
                handleDelete(account.id)
              }
            }}
            className="px-3 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            disabled={disableActions || !hasId}
          >
            Supprimer
          </button>
        </div>,
      ]
    })
  }, [accounts, rowBusyId, formSubmitting])

  return (
    <div className="space-y-6">
      <Card
        title="Comptes bancaires"
        right={
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(true)
              setEditingAccount(null)
            }}
            className="px-4 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={showCreateForm || rowBusyId !== null || formSubmitting}
          >
            + Ajouter un compte
          </button>
        }
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-sm text-gray-600">Chargement des comptes...</p>
        ) : (
          <Table
            headers={[
              'Nom',
              'IBAN',
              'Devise',
              'Solde initial',
              'Propriétaire',
              'Statut',
              'Actions',
            ]}
            rows={tableRows}
            emptyLabel="Aucun compte enregistré"
          />
        )}
      </Card>

      {showCreateForm && (
        <Card title="Nouveau compte">
          <AccountForm
            onSubmit={payload => handleCreate(payload)}
            onCancel={() => setShowCreateForm(false)}
            submitting={formSubmitting}
          />
        </Card>
      )}

      {editingAccount && (
        <Card title={`Modifier le compte ${editingAccount.name || editingAccount.id}`}>
          <AccountForm
            initialAccount={editingAccount}
            onSubmit={payload => handleUpdate(editingAccount.id, payload)}
            onCancel={() => setEditingAccount(null)}
            submitting={formSubmitting}
          />
        </Card>
      )}
    </div>
  )
}
