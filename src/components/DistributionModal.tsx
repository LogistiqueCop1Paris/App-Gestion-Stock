import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Categorie, Produit } from '../types'
import Modal from './Modal'

export default function DistributionModal({
  stockId,
  categories,
  produits,
  onClose,
  onDone,
}: {
  stockId: string
  categories: Categorie[]
  produits: Produit[]
  onClose: () => void
  onDone: () => void
}) {
  const [quantites, setQuantites] = useState<Record<string, string>>({})
  const [commentaire, setCommentaire] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parCategorie = useMemo(() => {
    const map = new Map<string, Produit[]>()
    for (const p of produits) {
      if (p.quantite <= 0) continue
      const list = map.get(p.categorie_id) ?? []
      list.push(p)
      map.set(p.categorie_id, list)
    }
    return map
  }, [produits])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const lignes: { produit_id: string; quantite: number }[] = []
    for (const p of produits) {
      const raw = quantites[p.id]
      if (!raw) continue
      const qte = parseInt(raw, 10)
      if (!Number.isInteger(qte) || qte <= 0) continue
      if (qte > p.quantite) {
        setError(`Quantité trop élevée pour ${p.nom} (${p.quantite} disponible(s)).`)
        return
      }
      lignes.push({ produit_id: p.id, quantite: qte })
    }

    if (lignes.length === 0) {
      setError('Indique au moins une quantité à sortir.')
      return
    }

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('creer_distribution', {
      p_stock_id: stockId,
      p_lignes: lignes,
      p_commentaire: commentaire.trim() || null,
    })
    setSaving(false)
    if (rpcError) {
      setError(`La sortie de stock a échoué : ${rpcError.message}`)
      return
    }
    onDone()
  }

  return (
    <Modal title="Sortie de stock — distribution" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <p className="modal-subtitle">
          Indique la quantité sortie pour chaque produit distribué aujourd'hui. Tu pourras
          enregistrer ce qu'il reste après la distribution.
        </p>

        {categories.map((cat) => {
          const items = parCategorie.get(cat.id) ?? []
          if (items.length === 0) return null
          return (
            <fieldset key={cat.id} className="distribution-fieldset">
              <legend>{cat.nom}</legend>
              {items.map((p) => (
                <div className="distribution-line" key={p.id}>
                  <span>
                    {p.nom} <em>({p.quantite} en stock)</em>
                    {parseInt(quantites[p.id] ?? '0', 10) === p.quantite && (
                      <em className="field-hint-inline"> — vide le stock</em>
                    )}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={p.quantite}
                    step={1}
                    placeholder="0"
                    value={quantites[p.id] ?? ''}
                    onChange={(e) => setQuantites((q) => ({ ...q, [p.id]: e.target.value }))}
                  />
                </div>
              ))}
            </fieldset>
          )
        })}

        <label>
          Commentaire (optionnel)
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="ex: problème ou événement particulier pendant la distribution"
            rows={2}
          />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Valider la sortie'}
        </button>
      </form>
    </Modal>
  )
}
