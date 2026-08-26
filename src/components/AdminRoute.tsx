import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { peutGererUtilisateurs } from '../roles'

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) return <div className="page-loading">Chargement…</div>
  if (!peutGererUtilisateurs(profile?.role)) {
    return (
      <div className="page">
        <p className="empty-state">Cette page est réservée au rôle Respo log.</p>
      </div>
    )
  }
  return <>{children}</>
}
