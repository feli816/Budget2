export function Badge({ ok }) {
  return (
    <span className={`px-2 py-1 rounded text-sm ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {ok ? 'OK' : 'KO'}
    </span>
  )
}

export function Card({ title, children, right }) {
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

export function KeyVal({ k, v }) {
  return (
    <div className="flex gap-2 text-sm">
      <div className="w-40 text-gray-600">{k}</div>
      <div className="font-medium">{v ?? '-'}</div>
    </div>
  )
}

export function Table({ headers, rows, emptyLabel = 'Aucune donnée' }) {
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
            <tr>
              <td className="px-3 py-2 text-gray-500" colSpan={headers.length}>
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-t">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function formatDate(value) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium' }).format(new Date(value))
  } catch (e) {
    return String(value)
  }
}

export function formatAmount(amount, currency = 'CHF') {
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
