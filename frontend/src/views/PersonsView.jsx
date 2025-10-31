import { useEffect, useMemo, useState } from 'react'
import { Card, Table } from '../components/ui'
import { createPerson, getPersons } from '../api'

function sortPersons(list) {
  return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export default function PersonsView() {
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '' })
  const [formError, setFormError] = useState('')
  const [formSubmitting, setFormSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    async function loadPersons() {
      setLoading(true)
      setError('')
      try {
        const data = await getPersons()
        if (!active) return
        const list = Array.isArray(data) ? sortPersons(data) : []
        setPersons(list)
      } catch (err) {
        if (!active) return
        setError(err.message || String(err))
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    loadPersons()
    return () => {
      active = false
    }
  }, [])

  function resetForm() {
    setForm({ name: '', email: '' })
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')

    const name = form.name.trim()
    if (!name) {
      setFormError('Le nom est obligatoire.')
      return
    }

    const payload = { name }
    if (form.email !== undefined && form.email !== null) {
      const trimmedEmail = form.email.trim()
      if (trimmedEmail) {
        payload.email = trimmedEmail
      }
    }

    setFormSubmitting(true)
    try {
      const created = await createPerson(payload)
      setPersons(prev => sortPersons([...prev, created]))
      resetForm()
      setShowCreateForm(false)
    } catch (err) {
      setFormError(err.message || String(err))
    } finally {
      setFormSubmitting(false)
    }
  }

  const tableRows = useMemo(() => {
    return persons.map(person => [
      <span key={`name-${person.id}`} className="font-medium text-gray-800">
        {person.name || `Personne #${person.id}`}
      </span>,
      <span key={`email-${person.id}`} className="text-sm text-gray-600">
        {person.email || '—'}
      </span>,
    ])
  }, [persons])

  return (
    <div className="space-y-6">
      <Card
        title="Personnes"
        right={
          <button
            type="button"
            onClick={() => {
              if (showCreateForm) {
                resetForm()
              }
              setShowCreateForm(prev => !prev)
            }}
            className="px-4 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={loading}
          >
            {showCreateForm ? 'Annuler' : '+ Ajouter une personne'}
          </button>
        }
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
        {showCreateForm && (
          <form onSubmit={handleSubmit} className="space-y-4 border border-blue-100 bg-blue-50/40 p-4 rounded-lg">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">Nom</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
                  className="border rounded px-3 py-2"
                  placeholder="Marie Dupont"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-gray-600">Email</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={event => setForm(prev => ({ ...prev, email: event.target.value }))}
                  className="border rounded px-3 py-2"
                  placeholder="marie.dupont@example.org"
                />
              </label>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setShowCreateForm(false)
                }}
                className="px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                disabled={formSubmitting}
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={formSubmitting}
              >
                Enregistrer
              </button>
            </div>
          </form>
        )}
        {loading ? (
          <p className="text-sm text-gray-600">Chargement des personnes...</p>
        ) : (
          <Table
            headers={['Nom', 'Email']}
            rows={tableRows}
            emptyLabel="Aucune personne enregistrée"
          />
        )}
      </Card>
    </div>
  )
}
