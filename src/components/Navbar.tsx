import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { peutGererUtilisateurs, ROLE_LABELS } from '../roles'
import logo from '../assets/logo.png'

export default function Navbar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/connexion')
  }

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <span className="brand">
          <img src={logo} alt="Solidarités Étudiantes CO-P1" className="brand-logo" />
          Gestion des stocks
        </span>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Stocks
        </NavLink>
        <NavLink to="/historique" className={({ isActive }) => (isActive ? 'active' : '')}>
          Historique
        </NavLink>
        <NavLink to="/statistiques" className={({ isActive }) => (isActive ? 'active' : '')}>
          Statistiques
        </NavLink>
        {peutGererUtilisateurs(profile?.role) && (
          <NavLink to="/utilisateurs" className={({ isActive }) => (isActive ? 'active' : '')}>
            Utilisateurs
          </NavLink>
        )}
      </div>
      <div className="navbar-right">
        {profile && (
          <span className="user-pill">
            {profile.prenom} {profile.nom} · {ROLE_LABELS[profile.role]}
          </span>
        )}
        <button className="link-button" onClick={handleSignOut}>
          Déconnexion
        </button>
      </div>
    </nav>
  )
}
