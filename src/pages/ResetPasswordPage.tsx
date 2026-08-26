import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Le lien reçu par email contient un jeton de récupération que le client Supabase
    // échange automatiquement contre une session temporaire à l'arrivée sur cette page.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      setChecking(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
        setChecking(false)
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.')
      return
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(`Impossible de changer le mot de passe : ${error.message}`)
      return
    }
    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Mot de passe changé</h1>
          <p>Redirection…</p>
        </div>
      </div>
    )
  }

  if (checking) {
    return <div className="page-loading">Vérification du lien…</div>
  }

  if (!ready) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Lien invalide ou expiré</h1>
          <p>Redemande un lien de réinitialisation depuis la page de connexion.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Nouveau mot de passe</h1>
        <label>
          Nouveau mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            autoFocus
          />
        </label>
        <label>
          Confirmation
          <input
            type="password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Valider'}
        </button>
      </form>
    </div>
  )
}
