import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    })
    setLoading(false)
    if (error) {
      setError(`Impossible d'envoyer l'email : ${error.message}`)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Email envoyé</h1>
          <p>
            Si un compte existe avec cette adresse, un email avec un lien de réinitialisation
            vient d'être envoyé. Pense à vérifier tes spams.
          </p>
          <p className="switch-link">
            <Link to="/connexion">Retour à la connexion</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Mot de passe oublié</h1>
        <p className="subtitle">Reçois un lien par email pour choisir un nouveau mot de passe.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Envoi…' : 'Envoyer le lien'}
        </button>
        <p className="switch-link">
          <Link to="/connexion">Retour à la connexion</Link>
        </p>
      </form>
    </div>
  )
}
