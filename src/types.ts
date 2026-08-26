export type Role = 'respo_log' | 'respo_autres' | 'vsc'

export interface Profile {
  id: string
  nom: string
  prenom: string
  email: string | null
  role: Role
}

export interface Stock {
  id: string
  nom: string
  created_at: string
}

export interface Categorie {
  id: string
  stock_id: string
  nom: string
}

export interface SourceOption {
  id: string
  nom: string
}

export interface Produit {
  id: string
  stock_id: string
  categorie_id: string
  nom: string
  quantite: number
  source: string
  date_peremption: string | null
  updated_at: string
}

export type TypeMouvement =
  | 'ajout'
  | 'retrait'
  | 'transfert_sortie'
  | 'transfert_entree'
  | 'distribution_sortie'
  | 'distribution_retour'

export interface Mouvement {
  id: string
  date_heure: string
  type: TypeMouvement
  quantite: number
  produit_nom: string
  stock_id: string | null
  stock_nom: string
  categorie_nom: string
  source: string | null
  transfert_id: string | null
  utilisateur_nom: string
  annule: boolean
  annulation_de: string | null
  commentaire: string | null
}

export type StatutDistribution = 'en_cours' | 'terminee'

export interface Distribution {
  id: string
  stock_id: string
  statut: StatutDistribution
  date_sortie: string
  date_retour: string | null
  utilisateur_sortie_nom: string
  utilisateur_retour_nom: string | null
  commentaire_sortie: string | null
  commentaire_retour: string | null
}

export interface DistributionLigne {
  id: string
  distribution_id: string
  produit_id: string | null
  produit_nom: string
  categorie_nom: string
  quantite_sortie: number
  quantite_retour: number | null
}
