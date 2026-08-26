import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Distribution, DistributionLigne } from '../types'
import Modal from './Modal'

export default function DistributionReturnModal({
  distribution,
  onClose,
  onDone,
}: {
  distribution: Distribution
  onClose: () => void
  onDone: () => void
}) {
  const [lignes, setLignes] = useState<DistributionLigne[]>([])
  const [restes, setRestes] = useState<Record<string, string>>({})
  const [nombrePaniers, setNombrePaniers] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('distribution_lignes')
      .select('*')
      .eq('distribution_id', distribution.id)
      .order('produit_nom')
      .then(({ data }) => {
        setLignes((data as DistributionLigne[]) ?? [])
        setLoading(false)
      })
  }, [distribution.id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const paniers = parseInt(nombrePaniers, 10)
    if (!Number.isInteger(paniers) || paniers < 0) {
      setError('Indique le nombre de paniers distribués (0 si aucun).')
      return
    }

    const retours: { ligne_id: string; quantite_retour: number }[] = []
    for (const l of lignes) {
      const raw = restes[l.id] ?? '0'
      const qte = parseInt(raw, 10)
      if (!Number.isInteger(qte) || qte < 0) {
        setError(`Quantité invalide pour ${l.produit_nom}.`)
        return
      }
      if (qte > l.quantite_sortie) {
        setError(`Le reste de ${l.produit_nom} ne peut pas dépasser ${l.quantite_sortie}.`)
        return
      }
      retours.push({ ligne_id: l.id, quantite_retour: qte })
    }

    setSaving(true)
    const { error: rpcError } = await supabase.rpc('cloturer_distribution', {
      p_distribution_id: distribution.id,
      p_retours: retours,
      p_commentaire: commentaire.trim() || null,
      p_nombre_paniers: paniers,
    })
    setSaving(false)
    if (rpcError) {
      setError(`Impossible d'enregistrer le reste : ${rpcError.message}`)
      return
    }
    onDone()
  }

  return (
    <Modal title="Reste de la distribution" onClose={onClose}>
      {loading ? (
        <p>Chargement…</p>
      ) : (
        <form onSubmit={handleSubmit} className="modal-form">
          <p className="modal-subtitle">
            Indique ce qu'il reste pour chaque produit sorti. Ce qui n'est pas renseigné est
            considéré comme entièrement distribué.
          </p>

          {distribution.commentaire_sortie && (
            <p className="modal-subtitle">
              <strong>Commentaire à la sortie :</strong> {distribution.commentaire_sortie}
            </p>
          )}

          {lignes.map((l) => (
            <div className="distribution-line" key={l.id}>
              <span>
                {l.produit_nom} <em>(sorti : {l.quantite_sortie})</em>
              </span>
              <input
                type="number"
                min={0}
                max={l.quantite_sortie}
                step={1}
                placeholder="0"
                value={restes[l.id] ?? ''}
                onChange={(e) => setRestes((r) => ({ ...r, [l.id]: e.target.value }))}
              />
            </div>
          ))}

          <label>
            Nombre de paniers distribués
            <input
              type="number"
              min={0}
              step={1}
              value={nombrePaniers}
              onChange={(e) => setNombrePaniers(e.target.value)}
              required
            />
          </label>

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
            {saving ? 'Enregistrement…' : 'Clôturer la distribution'}
          </button>
        </form>
      )}
    </Modal>
  )
}
