import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { peutAnnulerMouvement } from '../roles'
import type { Mouvement, Stock } from '../types'

const LABELS: Record<Mouvement['type'], string> = {
  ajout: 'Ajout',
  retrait: 'Retrait',
  transfert_sortie: 'Transfert (sortie)',
  transfert_entree: 'Transfert (entrée)',
  distribution_sortie: 'Distribution (sortie)',
  distribution_retour: 'Distribution (reste)',
}

const SIGN: Record<Mouvement['type'], '+' | '−'> = {
  ajout: '+',
  transfert_entree: '+',
  distribution_retour: '+',
  retrait: '−',
  transfert_sortie: '−',
  distribution_sortie: '−',
}

const TYPES_ANNULABLES: Mouvement['type'][] = ['ajout', 'retrait', 'transfert_sortie', 'transfert_entree']

const PAGE_SIZE = 50

function formatDayLabel(dateStr: string) {
  const date = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  if (isSameDay(date, today)) return "Aujourd'hui"
  if (isSameDay(date, yesterday)) return 'Hier'
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function groupByDay(mouvements: Mouvement[]) {
  const groups = new Map<string, Mouvement[]>()
  for (const m of mouvements) {
    const label = formatDayLabel(m.date_heure)
    const list = groups.get(label) ?? []
    list.push(m)
    groups.set(label, list)
  }
  return groups
}

export default function HistoryPage() {
  const { profile } = useAuth()
  const peutAnnuler = peutAnnulerMouvement(profile?.role)
  const [mouvements, setMouvements] = useState<Mouvement[]>([])
  const [stocks, setStocks] = useState<Stock[]>([])
  const [stockFilter, setStockFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('stocks')
      .select('*')
      .order('nom')
      .then(({ data }) => setStocks((data as Stock[]) ?? []))
  }, [])

  async function load() {
    setLoading(true)
    let query = supabase
      .from('mouvements')
      .select('*')
      .order('date_heure', { ascending: false })
      .limit(PAGE_SIZE)

    if (stockFilter) query = query.eq('stock_id', stockFilter)
    if (search.trim()) query = query.ilike('produit_nom', `%${search.trim()}%`)

    const { data } = await query
    setMouvements((data as Mouvement[]) ?? [])
    setHasMore((data?.length ?? 0) === PAGE_SIZE)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockFilter])

  const groups = useMemo(() => groupByDay(mouvements), [mouvements])

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    load()
  }

  async function handleAnnuler(id: string) {
    if (!window.confirm('Annuler ce mouvement ? Une ligne compensatoire sera ajoutée à l\'historique.')) {
      return
    }
    setError(null)
    setCancellingId(id)
    const { error } = await supabase.rpc('annuler_mouvement', { p_mouvement_id: id })
    setCancellingId(null)
    if (error) {
      setError(`Impossible d'annuler ce mouvement : ${error.message}`)
      return
    }
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Historique</h1>
      </div>

      <form className="history-filters" onSubmit={handleSearchSubmit}>
        <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
          <option value="">Tous les stocks</option>
          {stocks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Rechercher un produit…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit">Filtrer</button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Chargement…</p>
      ) : mouvements.length === 0 ? (
        <p className="empty-state">Aucun mouvement trouvé.</p>
      ) : (
        <div className="history-timeline">
          {[...groups.entries()].map(([dayLabel, items]) => (
            <section key={dayLabel} className="history-day">
              <h3 className="history-day-label">{dayLabel}</h3>
              <div className="history-day-items">
                {items.map((m) => (
                  <article key={m.id} className={`history-item${m.annule ? ' is-annule' : ''}`}>
                    <div
                      className={`history-item-badge ${SIGN[m.type] === '+' ? 'is-positive' : 'is-negative'}`}
                    >
                      {SIGN[m.type]}
                      {m.quantite}
                    </div>
                    <div className="history-item-body">
                      <div className="history-item-top">
                        <span className="history-item-produit">{m.produit_nom}</span>
                        <span className="history-item-type">{LABELS[m.type]}</span>
                        {m.annule && <span className="annule-badge">annulé</span>}
                        {m.annulation_de && <span className="annule-badge">annulation</span>}
                      </div>
                      <p className="history-item-meta">
                        {m.stock_nom} · {m.categorie_nom}
                        {m.source && ` · ${m.source}`} ·{' '}
                        {new Date(m.date_heure).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {m.utilisateur_nom}
                      </p>
                      {m.commentaire && <p className="history-item-comment">« {m.commentaire} »</p>}
                    </div>
                    {peutAnnuler && !m.annule && !m.annulation_de && TYPES_ANNULABLES.includes(m.type) && (
                      <button
                        className="small-button history-item-action"
                        disabled={cancellingId === m.id}
                        onClick={() => handleAnnuler(m.id)}
                      >
                        Annuler
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!loading && hasMore && (
        <p className="empty-state">Affichage des {PAGE_SIZE} mouvements les plus récents.</p>
      )}
    </div>
  )
}
