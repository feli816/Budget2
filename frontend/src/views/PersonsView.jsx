import { useEffect, useMemo, useState } from 'react'
import { Card, Table } from '../components/ui'
import { getPersons } from '../api'

export default function PersonsView() {
  const [persons, setPersons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadPersons() {
      setLoading(true)
      setError('')
      try {
        const data = await getPersons()
        if (!active) return
        const list = Array.isArray(data) ? data.slice() : []
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
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
      <Card title="Personnes">
        {error && <p className="text-sm text-red-600">{error}</p>}
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
