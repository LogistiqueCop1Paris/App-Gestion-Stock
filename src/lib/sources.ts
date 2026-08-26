import { supabase } from './supabaseClient'

// Retourne le nom de la source à enregistrer sur le produit/mouvement. Si une
// nouvelle source a été tapée, on l'ajoute à la liste gérée "sources" pour
// qu'elle apparaisse ensuite dans le menu déroulant (comme les catégories).
export async function resolveSourceName(sourceId: string, nouvelleSource: string, sourcesById: Record<string, string>) {
  const trimmed = nouvelleSource.trim()
  if (trimmed) {
    await supabase.from('sources').insert({ nom: trimmed })
    return trimmed
  }
  return sourcesById[sourceId] ?? ''
}
