import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { resolveSourceName } from '../lib/sources'
import type { Categorie, Produit, SourceOption } from '../types'
import Modal from './Modal'

export default function AddProductModal({
  stockId,
  categories,
  produits,
  sources,
  onClose,
  onDone,
}: {
  stockId: string
  categories: Categorie[]
  produits: Produit[]
  sources: SourceOption[]
  onClose: () => void
  onDone: () => void
}) {
  const [nom, setNom] = useState('')
  const [quantite, setQuantite] = useState('0')
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [nouvelleSource, setNouvelleSource] = useState('')
  const [datePeremption, setDatePeremption] = useState('')
  const [categorieId, setCategorieId] = useState(categories[0]?.id ?? '')
  const [nouvelleCategorie, setNouvelleCategorie] = useState('')
  const [produitExistantId, setProduitExistantId] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sourcesById = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, s.nom])),
    [sources]
  )

  const produitsDeLaCategorie = useMemo(
    () => produits.filter((p) => p.categorie_id === categorieId),
    [produits, categorieId]
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const qte = parseInt(quantite, 10)
    if (!Number.isInteger(qte) || qte < 0) {
      setError('La quantité doit être un nombre entier positif.')
      return
    }
    if (!sourceId && !nouvelleSource.trim()) {
      setError('Choisis une source ou crée-en une nouvelle.')
      return
    }

    setSaving(true)
    try {
      const source = await resolveSourceName(sourceId, nouvelleSource, sourcesById)

      // Produit déjà existant sélectionné : on incrémente sa quantité au lieu
      // d'en créer un nouveau (même logique que la sélection de catégorie).
      if (produitExistantId) {
        if (qte === 0) {
          setError('Indique une quantité à ajouter.')
          setSaving(false)
          return
        }
        const { error: rpcError } = await supabase.rpc('ajuster_quantite', {
          p_produit_id: produitExistantId,
          p_delta: qte,
          p_type: 'ajout',
          p_source: source,
          p_commentaire: commentaire.trim() || null,
        })
        if (rpcError) throw rpcError
        onDone()
        return
      }

      let finalCategorieId = categorieId

      if (!finalCategorieId && nouvelleCategorie.trim()) {
        const { data: cat, error: catError } = await supabase
          .from('categories')
          .insert({ stock_id: stockId, nom: nouvelleCategorie.trim() })
          .select()
          .single()
        if (catError) throw catError
        finalCategorieId = cat.id
      }

      if (!finalCategorieId) {
        setError('Choisis une catégorie ou crée-en une nouvelle.')
        setSaving(false)
        return
      }

      const { data: produit, error: prodError } = await supabase
        .from('produits')
        .insert({
          stock_id: stockId,
          categorie_id: finalCategorieId,
          nom: nom.trim(),
          quantite: qte,
          source,
          date_peremption: datePeremption || null,
        })
        .select()
        .single()
      if (prodError) throw prodError

      const { error: rpcError } = await supabase.rpc('journaliser_creation_produit', {
        p_produit_id: produit.id,
        p_commentaire: commentaire.trim() || null,
      })
      if (rpcError) throw rpcError

      onDone()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Impossible d'ajouter ce produit : ${message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Ajouter un produit" onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <label>
          Catégorie
          <select
            value={categorieId}
            onChange={(e) => {
              setCategorieId(e.target.value)
              setProduitExistantId('')
            }}
            disabled={categories.length === 0}
          >
            <option value="">
              {categories.length === 0 ? 'Aucune catégorie existante' : '— choisir —'}
            </option>
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
              if (e.target.value) {
                setCategorieId('')
                setProduitExistantId('')
              }
            }}
            placeholder="ex: Féculents"
          />
        </label>

        {categorieId && produitsDeLaCategorie.length > 0 && (
          <label>
            Produit existant (optionnel)
            <select
              value={produitExistantId}
              onChange={(e) => {
                setProduitExistantId(e.target.value)
                if (e.target.value) setNom('')
              }}
            >
              <option value="">— nouveau produit —</option>
              {produitsDeLaCategorie.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} (quantité actuelle : {p.quantite})
                </option>
              ))}
            </select>
          </label>
        )}

        {!produitExistantId && (
          <label>
            Nom du produit
            <input value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus />
          </label>
        )}

        <label>
          Quantité {produitExistantId ? 'à ajouter' : 'initiale'}
          <input
            type="number"
            min={0}
            step={1}
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            required
          />
        </label>

        <label>
          Source
          <select
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value)
              if (e.target.value) setNouvelleSource('')
            }}
            disabled={sources.length === 0}
          >
            <option value="">{sources.length === 0 ? 'Aucune source existante' : '— choisir —'}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>

        <label>
          Ou nouvelle source
          <input
            value={nouvelleSource}
            onChange={(e) => {
              setNouvelleSource(e.target.value)
              if (e.target.value) setSourceId('')
            }}
            placeholder="ex: Épicerie solidaire"
          />
        </label>

        {!produitExistantId && (
          <label>
            Date de péremption (optionnel)
            <input
              type="date"
              value={datePeremption}
              onChange={(e) => setDatePeremption(e.target.value)}
            />
          </label>
        )}

        <label>
          Commentaire (optionnel)
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="ex: carton légèrement abîmé"
            rows={2}
          />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Ajout…' : 'Ajouter'}
        </button>
      </form>
    </Modal>
  )
}
