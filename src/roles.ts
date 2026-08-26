import type { Role } from './types'

export const ROLES: Role[] = ['respo_log', 'respo_autres', 'vsc']

export const ROLE_LABELS: Record<Role, string> = {
  respo_log: 'Respo log',
  respo_autres: 'Respo autres',
  vsc: 'VSC',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  respo_log:
    'Peut tout faire et tout voir : changer le rôle de n\'importe quel compte, supprimer un compte ou un stock, annuler un mouvement depuis l\'historique, renommer stocks/catégories/produits.',
  respo_autres:
    'Peut tout faire sauf transférer un produit entre stocks ou supprimer un stock. Accès à l\'historique. Peut renommer stocks, catégories et produits, et supprimer des catégories.',
  vsc: 'Peut uniquement faire des sorties de stock pour une distribution et enregistrer le reste ensuite. Accès à l\'historique en lecture.',
}

export function peutModifierStock(role: Role | undefined): boolean {
  return role === 'respo_log' || role === 'respo_autres'
}

export function peutTransferer(role: Role | undefined): boolean {
  return role === 'respo_log'
}

export function peutGererUtilisateurs(role: Role | undefined): boolean {
  return role === 'respo_log'
}

export function peutSupprimerStock(role: Role | undefined): boolean {
  return role === 'respo_log'
}

export function peutAnnulerMouvement(role: Role | undefined): boolean {
  return role === 'respo_log'
}
