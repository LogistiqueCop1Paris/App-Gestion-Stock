import { useState, type FormEvent } from 'react'
import Modal from './Modal'

export default function RenameModal({
  title,
  currentName,
  onClose,
  onSubmit,
}: {
  title: string
  currentName: string
  onClose: () => void
  onSubmit: (newName: string) => Promise<{ error?: string }>
}) {
  const [nom, setNom] = useState(currentName)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = nom.trim()
    if (!trimmed) {
      setError('Le nom ne peut pas être vide.')
      return
    }
    if (trimmed === currentName) {
      onClose()
      return
    }

    setSaving(true)
    const result = await onSubmit(trimmed)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="modal-form">
        <label>
          Nouveau nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Renommer'}
        </button>
      </form>
    </Modal>
  )
}
