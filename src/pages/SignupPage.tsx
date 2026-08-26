import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function SignupPage() {
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!nom.trim() || !prenom.trim()) {
      setError('Nom et prénom sont obligatoires.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nom, prenom } },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    // Si la confirmation par email est désactivée dans Supabase, la session est
    // déjà active : on peut naviguer directement.
    if (data.session) {
      navigate('/')
    } else {
      setDone(true)
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Compte créé</h1>
          <p>Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.</p>
          <Link to="/connexion">Retour à la connexion</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Gestion des stocks</h1>
        <p className="subtitle">Créer un compte</p>
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="DUPONT" required />
        </label>
        <label>
          Prénom
          <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Marie" required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Création…' : 'Créer le compte'}
        </button>
        <p className="switch-link">
          Déjà un compte ? <Link to="/connexion">Se connecter</Link>
        </p>
      </form>
    </div>
  )
}
