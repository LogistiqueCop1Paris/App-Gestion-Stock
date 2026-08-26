import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Categorie, Produit, Stock } from '../types'
import Modal from './Modal'

export default function TransferModal({
  produit,
  currentStockNom,
  onClose,
  onDone,
}: {
  produit: Produit
  currentStockNom: string
  onClose: () => void
  onDone: () => void
}) {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [stockDestId, setStockDestId] = useState('')
  const [categories, setCategories] = useState<Categorie[]>([])
  const [categorieDestId, setCategorieDestId] = useState('')
  const [nouvelleCategorie, setNouvelleCategorie] = useState('')
  const [quantite, setQuantite] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('stocks')
      .select('*')
      .neq('id', produit.stock_id)
      .order('nom')
      .then(({ data }) => setStocks((data as Stock[]) ?? []))
  }, [produit.stock_id])

  useEffect(() => {
    if (!stockDestId) {
      setCategories([])
      setCategorieDestId('')
      return
    }
    supabase
      .from('categories')
      .select('*')
      .eq('stock_id', stockDestId)
      .order('nom')
      .then(({ data }) => {
        const cats = (data as Categorie[]) ?? []
        setCategories(cats)
        setCategorieDestId(cats[0]?.id ?? '')
      })
  }, [stockDestId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const qte = parseInt(quantite, 10)
    if (!Number.isInteger(qte) || qte <= 0) {
      setError('La quantité doit être un nombre entier positif.')
      return
    }
    if (qte > produit.quantite) {
      setError(`Quantité en stock insuffisante (${produit.quantite} disponible(s)).`)
      return
    }
    if (!stockDestId) {
      setError('Choisis un stock de destination.')
      return
    }

    setSaving(true)
    try {
      let finalCategorieId = categorieDestId
      if (!finalCategorieId && nouvelleCategorie.trim()) {
        const { data: cat, error: catError } = await supabase
          .from('categories')
          .insert({ stock_id: stockDestId, nom: nouvelleCategorie.trim() })
          .select()
          .single()
        if (catError) throw catError
        finalCategorieId = cat.id
      }
      if (!finalCategorieId) {
        setError('Choisis une catégorie de destination ou crée-en une nouvelle.')
        setSaving(false)
        return
      }

      const { error: rpcError } = await supabase.rpc('transferer_produit', {
        p_produit_id: produit.id,
        p_quantite: qte,
        p_stock_dest_id: stockDestId,
        p_categorie_dest_id: finalCategorieId,
      })
      if (rpcError) throw rpcError
      onDone()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Le transfert a échoué : ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Transférer — ${produit.nom}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <p className="modal-subtitle">
          Depuis <strong>{currentStockNom}</strong> · quantité disponible : {produit.quantite}
        </p>

        <label>
          Quantité à transférer
          <input
            type="number"
            min={1}
            step={1}
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            required
            autoFocus
          />
        </label>

        {parseInt(quantite, 10) === produit.quantite && (
          <p className="field-hint">
            ⚠️ Ça videra ce produit — il sera retiré du stock (récupérable en annulant ce
            transfert depuis l'Historique).
          </p>
        )}

        <label>
          Stock destination
          <select value={stockDestId} onChange={(e) => setStockDestId(e.target.value)} required>
            <option value="">— choisir —</option>
            {stocks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>

        {stockDestId && (
          <>
            <label>
              Catégorie destination
              <select
                value={categorieDestId}
                onChange={(e) => setCategorieDestId(e.target.value)}
                disabled={categories.length === 0}
              >
                {categories.length === 0 && <option value="">Aucune catégorie existante</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ou nouvelle catégorie
              <input
                value={nouvelleCategorie}
                onChange={(e) => {
                  setNouvelleCategorie(e.target.value)
                  if (e.target.value) setCategorieDestId('')
                }}
                placeholder="ex: Féculents"
              />
            </label>
          </>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Transfert…' : 'Transférer'}
        </button>
      </form>
    </Modal>
  )
}
