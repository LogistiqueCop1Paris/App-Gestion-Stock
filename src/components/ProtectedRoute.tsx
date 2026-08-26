import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <div className="page-loading">Chargement…</div>
  if (!session) return <Navigate to="/connexion" replace />
  return <>{children}</>
}
