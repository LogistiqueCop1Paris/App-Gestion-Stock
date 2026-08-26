import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types'
import Modal from './Modal'

function genererMotDePasse() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let mdp = ''
  for (let i = 0; i < 10; i++) {
    mdp += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return mdp
}

export default function SetPasswordModal({
  profile,
  onClose,
}: {
  profile: Profile
  onClose: () => void
}) {
  const [password, setPassword] = useState(genererMotDePasse)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.')
      return
    }

    setSaving(true)
    const { data, error: invokeError } = await supabase.functions.invoke('admin-set-password', {
      body: { userId: profile.id, newPassword: password },
    })
    setSaving(false)
    if (invokeError || data?.error) {
      setError(`Impossible de définir ce mot de passe : ${data?.error ?? invokeError?.message}`)
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <Modal title={`Mot de passe — ${profile.prenom} ${profile.nom}`} onClose={onClose}>
        <p className="modal-subtitle">
          Nouveau mot de passe défini. Transmets-le à {profile.prenom} par le canal habituel de
          l'asso (il n'est envoyé par aucun email) :
        </p>
        <p className="password-display">{password}</p>
        <button type="button" onClick={onClose}>
          Fermer
        </button>
      </Modal>
    )
  }

  return (
    <Modal title={`Définir un mot de passe — ${profile.prenom} ${profile.nom}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <p className="modal-subtitle">
          Ne passe par aucun email : tu devras transmettre ce mot de passe toi-même à la
          personne concernée.
        </p>
        <label>
          Nouveau mot de passe
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            autoFocus
          />
        </label>
        <button
          type="button"
          className="small-button"
          onClick={() => setPassword(genererMotDePasse())}
        >
          🎲 Regénérer
        </button>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Valider'}
        </button>
      </form>
    </Modal>
  )
}
