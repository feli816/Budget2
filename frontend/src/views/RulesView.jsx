import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Table } from '../components/ui'
import {
  createRule,
  deleteRule,
  getCategories,
  getRules,
  reorderRules,
  updateRule,
} from '../api'

const targetKindLabels = {
  income: 'Revenus',
  expense: 'Dépenses',
  transfer: 'Transferts',
}

function parseKeywords(value) {
  if (!value) return []
  return value
    .split(/[\n,;]+/)
    .map(part => part.trim())
    .filter(Boolean)
}

function RuleForm({ initialRule, categories, onSubmit, onCancel, submitting }) {
  const [form, setForm] = useState({
    target_kind: initialRule?.target_kind ?? 'expense',
    category_id: initialRule?.category_id ? String(initialRule.category_id) : '',
    keywords: Array.isArray(initialRule?.keywords) ? initialRule.keywords.join(', ') : '',
    priority:
      initialRule && initialRule.priority !== undefined && initialRule.priority !== null
        ? String(initialRule.priority)
        : '0',
    enabled: initialRule?.enabled ?? true,
  })
  const [error, setError] = useState('')

  useEffect(() => {
    setForm({
      target_kind: initialRule?.target_kind ?? 'expense',
      category_id: initialRule?.category_id ? String(initialRule.category_id) : '',
      keywords: Array.isArray(initialRule?.keywords) ? initialRule.keywords.join(', ') : '',
      priority:
        initialRule && initialRule.priority !== undefined && initialRule.priority !== null
          ? String(initialRule.priority)
          : '0',
      enabled: initialRule?.enabled ?? true,
    })
    setError('')
  }, [initialRule])

  function handleChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!form.category_id) {
      setError('Veuillez sélectionner une catégorie.')
      return
    }

    const priorityNumber = Number(form.priority)
    const payload = {
      target_kind: form.target_kind,
      category_id: Number(form.category_id),
      keywords: parseKeywords(form.keywords),
      priority: Number.isFinite(priorityNumber) ? priorityNumber : 0,
      enabled: Boolean(form.enabled),
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
          <span className="text-gray-600">Type de cible</span>
          <select
            value={form.target_kind}
            onChange={event => handleChange('target_kind', event.target.value)}
            className="border rounded px-3 py-2"
          >
            {Object.entries(targetKindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Catégorie</span>
          <select
            value={form.category_id}
            onChange={event => handleChange('category_id', event.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="">Sélectionnez...</option>
            {categories.map(category => (
              <option key={category.id} value={String(category.id)}>
                {category.name || category.id}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="text-gray-600">Mots-clés (séparés par virgule ou retour à la ligne)</span>
          <textarea
            value={form.keywords}
            onChange={event => handleChange('keywords', event.target.value)}
            rows={3}
            className="border rounded px-3 py-2"
            placeholder="ex: coop, migros, facture"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">Priorité</span>
          <input
            type="number"
            value={form.priority}
            onChange={event => handleChange('priority', event.target.value)}
            className="border rounded px-3 py-2"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={event => handleChange('enabled', event.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-gray-600">Règle active</span>
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

export default function RulesView() {
  const [rules, setRules] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rowBusyId, setRowBusyId] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rulesData, categoriesData] = await Promise.all([getRules(), getCategories()])
      setRules(Array.isArray(rulesData) ? rulesData : [])
      const sortedCategories = Array.isArray(categoriesData)
        ? [...categoriesData].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        : []
      setCategories(sortedCategories)
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const categoriesById = useMemo(() => {
    const map = new Map()
    for (const category of categories) {
      map.set(category.id, category)
    }
    return map
  }, [categories])

  async function handleCreate(payload) {
    setFormSubmitting(true)
    try {
      await createRule(payload)
      setShowCreateForm(false)
      await loadData()
    } catch (err) {
      throw err
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleUpdate(ruleId, payload) {
    setFormSubmitting(true)
    try {
      await updateRule(ruleId, payload)
      setEditingRule(null)
      await loadData()
    } catch (err) {
      throw err
    } finally {
      setFormSubmitting(false)
    }
  }

  async function handleDelete(ruleId) {
    if (!window.confirm('Supprimer cette règle ?')) {
      return
    }
    setRowBusyId(ruleId)
    setError('')
    try {
      await deleteRule(ruleId)
      await loadData()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setRowBusyId(null)
    }
  }

  async function handleMove(ruleId, direction) {
    const index = rules.findIndex(rule => rule.id === ruleId)
    if (index === -1) return
    const neighbourIndex = direction === 'up' ? index - 1 : index + 1
    const neighbour = rules[neighbourIndex]
    if (!neighbour) return

    setRowBusyId(ruleId)
    setError('')
    try {
      await reorderRules([
        { id: ruleId, priority: neighbour.priority ?? 0 },
        { id: neighbour.id, priority: rules[index].priority ?? 0 },
      ])
      await loadData()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setRowBusyId(null)
    }
  }

  const tableRows = useMemo(() => {
    return rules.map((rule, index) => {
      const category = categoriesById.get(rule.category_id)
      const keywords = Array.isArray(rule.keywords) ? rule.keywords : []
      const moveUpDisabled = index === 0 || rowBusyId !== null
      const moveDownDisabled = index === rules.length - 1 || rowBusyId !== null
      const disableActions = rowBusyId !== null

      return [
        <span key={`priority-${rule.id}`} className="font-semibold text-gray-700">
          {rule.priority ?? 0}
        </span>,
        <span key={`target-${rule.id}`} className="uppercase tracking-wide text-xs text-gray-600">
          {targetKindLabels[rule.target_kind] || rule.target_kind || '-'}
        </span>,
        <span key={`category-${rule.id}`} className="font-medium">
          {category?.name || category?.id || rule.category_id || '-'}
        </span>,
        <span key={`keywords-${rule.id}`} className="text-sm text-gray-600">
          {keywords.length ? keywords.join(', ') : '—'}
        </span>,
        <span
          key={`enabled-${rule.id}`}
          className={`text-sm font-medium ${rule.enabled ? 'text-emerald-600' : 'text-gray-500'}`}
        >
          {rule.enabled ? 'Activée' : 'Désactivée'}
        </span>,
        <div key={`actions-${rule.id}`} className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleMove(rule.id, 'up')}
            className="px-3 py-1 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            disabled={moveUpDisabled}
          >
            Monter
          </button>
          <button
            type="button"
            onClick={() => handleMove(rule.id, 'down')}
            className="px-3 py-1 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
            disabled={moveDownDisabled}
          >
            Descendre
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingRule(rule)
              setShowCreateForm(false)
            }}
            className="px-3 py-1 rounded-full border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
            disabled={disableActions}
          >
            Modifier
          </button>
          <button
            type="button"
            onClick={() => handleDelete(rule.id)}
            className="px-3 py-1 rounded-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
            disabled={disableActions}
          >
            Supprimer
          </button>
        </div>,
      ]
    })
  }, [rules, categoriesById, rowBusyId])

  return (
    <div className="space-y-6">
      <Card
        title="Règles de catégorisation"
        right={
          <button
            type="button"
            onClick={() => {
              setShowCreateForm(true)
              setEditingRule(null)
            }}
            className="px-4 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={showCreateForm || rowBusyId !== null || formSubmitting}
          >
            + Ajouter une règle
          </button>
        }
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="text-sm text-gray-600">Chargement des règles...</p>
        ) : (
          <Table
            headers={[
              'Priorité',
              'Type',
              'Catégorie',
              'Mots-clés',
              'Statut',
              'Actions',
            ]}
            rows={tableRows}
            emptyLabel="Aucune règle définie"
          />
        )}
      </Card>

      {showCreateForm && (
        <Card title="Nouvelle règle">
          <RuleForm
            categories={categories}
            onSubmit={async payload => {
              await handleCreate(payload)
            }}
            onCancel={() => {
              setShowCreateForm(false)
            }}
            submitting={formSubmitting}
          />
        </Card>
      )}

      {editingRule && (
        <Card title={`Modifier la règle #${editingRule.id}`}>
          <RuleForm
            initialRule={editingRule}
            categories={categories}
            onSubmit={async payload => {
              await handleUpdate(editingRule.id, payload)
            }}
            onCancel={() => setEditingRule(null)}
            submitting={formSubmitting}
          />
        </Card>
      )}
    </div>
  )
}

