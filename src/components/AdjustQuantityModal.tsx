import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { resolveSourceName } from '../lib/sources'
import type { Produit, SourceOption } from '../types'
import Modal from './Modal'

export default function AdjustQuantityModal({
  produit,
  type,
  sources,
  onClose,
  onDone,
}: {
  produit: Produit
  type: 'ajout' | 'retrait'
  sources: SourceOption[]
  onClose: () => void
  onDone: () => void
}) {
  const [quantite, setQuantite] = useState('1')
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '')
  const [nouvelleSource, setNouvelleSource] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sourcesById = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, s.nom])),
    [sources]
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const qte = parseInt(quantite, 10)
    if (!Number.isInteger(qte) || qte <= 0) {
      setError('La quantité doit être un nombre entier positif.')
      return
    }
    if (type === 'retrait' && qte > produit.quantite) {
      setError(`Quantité en stock insuffisante (${produit.quantite} disponible(s)).`)
      return
    }
    if (type === 'ajout' && !sourceId && !nouvelleSource.trim()) {
      setError('Choisis une source ou crée-en une nouvelle.')
      return
    }

    setSaving(true)
    const source =
      type === 'ajout' ? await resolveSourceName(sourceId, nouvelleSource, sourcesById) : null
    const { error } = await supabase.rpc('ajuster_quantite', {
      p_produit_id: produit.id,
      p_delta: type === 'ajout' ? qte : -qte,
      p_type: type,
      p_source: source,
      p_commentaire: commentaire.trim() || null,
    })
    setSaving(false)
    if (error) {
      setError(`Une erreur est survenue : ${error.message}`)
      return
    }
    onDone()
  }

  return (
    <Modal title={`${type === 'ajout' ? 'Ajouter' : 'Retirer'} — ${produit.nom}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <p className="modal-subtitle">Quantité actuelle : {produit.quantite}</p>
        <label>
          Quantité à {type === 'ajout' ? 'ajouter' : 'retirer'}
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
        {type === 'retrait' && parseInt(quantite, 10) === produit.quantite && (
          <p className="field-hint">
            ⚠️ Ça videra ce produit — il sera retiré du stock (récupérable en annulant ce
            retrait depuis l'Historique).
          </p>
        )}
        {type === 'ajout' && (
          <>
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
                <option value="">
                  {sources.length === 0 ? 'Aucune source existante' : '— choisir —'}
                </option>
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
          </>
        )}
        <label>
          Commentaire (optionnel)
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="ex: erreur de comptage lors du dernier inventaire"
            rows={2}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Valider'}
        </button>
      </form>
    </Modal>
  )
}
