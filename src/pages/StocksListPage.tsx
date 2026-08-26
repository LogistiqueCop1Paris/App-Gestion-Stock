import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import type { Stock } from '../types'
import Modal from '../components/Modal'

export default function StocksListPage() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [nom, setNom] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('stocks').select('*').order('nom')
    if (!error) setStocks(data as Stock[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('stocks').insert({ nom: nom.trim() })
    if (error) {
      setError(`Impossible de créer ce stock : ${error.message}`)
      return
    }
    setNom('')
    setShowAdd(false)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Stocks</h1>
        <button onClick={() => setShowAdd(true)}>+ Nouveau stock</button>
      </div>

      {loading ? (
        <p>Chargement…</p>
      ) : stocks.length === 0 ? (
        <p className="empty-state">Aucun stock pour l'instant. Crée le premier lieu à gérer.</p>
      ) : (
        <div className="card-grid">
          {stocks.map((s) => (
            <Link key={s.id} to={`/stocks/${s.id}`} className="stock-card">
              <h3>{s.nom}</h3>
              <span>Voir le stock →</span>
            </Link>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Nouveau stock" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleCreate} className="modal-form">
            <label>
              Nom du lieu
              <input value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit">Créer</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
