import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../auth/AuthContext'
import { peutModifierStock, peutSupprimerStock, peutTransferer } from '../roles'
import type { Categorie, Distribution, Produit, SourceOption, Stock } from '../types'
import AddProductModal from '../components/AddProductModal'
import AdjustQuantityModal from '../components/AdjustQuantityModal'
import TransferModal from '../components/TransferModal'
import DistributionModal from '../components/DistributionModal'
import DistributionReturnModal from '../components/DistributionReturnModal'
import RenameModal from '../components/RenameModal'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR')
}

type RenameTarget = { table: 'stocks' | 'categories' | 'produits'; id: string; currentName: string }

export default function StockPage() {
  const { stockId } = useParams<{ stockId: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const peutModifier = peutModifierStock(profile?.role)
  const peutTransf = peutTransferer(profile?.role)
  const peutSupprimer = peutSupprimerStock(profile?.role)
  const [stock, setStock] = useState<Stock | null>(null)
  const [categories, setCategories] = useState<Categorie[]>([])
  const [produits, setProduits] = useState<Produit[]>([])
  const [sources, setSources] = useState<SourceOption[]>([])
  const [distributionsEnCours, setDistributionsEnCours] = useState<Distribution[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showDistribution, setShowDistribution] = useState(false)
  const [adjustTarget, setAdjustTarget] = useState<{ produit: Produit; type: 'ajout' | 'retrait' } | null>(
    null
  )
  const [transferTarget, setTransferTarget] = useState<Produit | null>(null)
  const [returnTarget, setReturnTarget] = useState<Distribution | null>(null)
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingCategorieId, setDeletingCategorieId] = useState<string | null>(null)
  const [deletingStock, setDeletingStock] = useState(false)

  async function load() {
    if (!stockId) return
    setLoading(true)
    const [{ data: stockData }, { data: catData }, { data: prodData }, { data: srcData }, { data: distData }] =
      await Promise.all([
        supabase.from('stocks').select('*').eq('id', stockId).single(),
        supabase.from('categories').select('*').eq('stock_id', stockId).order('nom'),
        supabase.from('produits').select('*').eq('stock_id', stockId).order('nom'),
        supabase.from('sources').select('*').order('nom'),
        supabase
          .from('distributions')
          .select('*')
          .eq('stock_id', stockId)
          .eq('statut', 'en_cours')
          .order('date_sortie', { ascending: false }),
      ])
    setStock(stockData as Stock)
    setCategories((catData as Categorie[]) ?? [])
    setProduits((prodData as Produit[]) ?? [])
    setSources((srcData as SourceOption[]) ?? [])
    setDistributionsEnCours((distData as Distribution[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockId])

  const produitsParCategorie = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term ? produits.filter((p) => p.nom.toLowerCase().includes(term)) : produits
    const map = new Map<string, Produit[]>()
    for (const p of filtered) {
      const list = map.get(p.categorie_id) ?? []
      list.push(p)
      map.set(p.categorie_id, list)
    }
    return map
  }, [produits, search])

  async function handleRename(newName: string): Promise<{ error?: string }> {
    if (!renameTarget) return {}
    const { error } = await supabase
      .from(renameTarget.table)
      .update({ nom: newName })
      .eq('id', renameTarget.id)
    if (error) return { error: error.message }
    setRenameTarget(null)
    load()
    return {}
  }

  async function handleDeleteCategorie(cat: Categorie) {
    if (
      !window.confirm(
        `Supprimer la catégorie "${cat.nom}" ? Impossible si elle contient encore des produits.`
      )
    ) {
      return
    }
    setError(null)
    setDeletingCategorieId(cat.id)
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    setDeletingCategorieId(null)
    if (error) {
      setError(
        error.code === '23503'
          ? `Impossible de supprimer "${cat.nom}" : elle contient encore des produits.`
          : `Impossible de supprimer "${cat.nom}" : ${error.message}`
      )
      return
    }
    load()
  }

  async function handleDeleteStock() {
    if (!stock) return
    const totalQuantite = produits.reduce((sum, p) => sum + p.quantite, 0)
    const message =
      categories.length === 0 && produits.length === 0
        ? `Supprimer le stock "${stock.nom}" ? Il est vide. Cette action est irréversible.`
        : `Supprimer le stock "${stock.nom}" ? Il contient ${categories.length} catégorie(s) et ` +
          `${produits.length} produit(s) (${totalQuantite} unité(s) au total) qui seront ` +
          `définitivement supprimés avec le stock. Cette action est irréversible.`
    if (!window.confirm(message)) return

    setError(null)
    setDeletingStock(true)
    const { error } = await supabase.from('stocks').delete().eq('id', stock.id)
    setDeletingStock(false)
    if (error) {
      setError(`Impossible de supprimer ce stock : ${error.message}`)
      return
    }
    navigate('/')
  }

  if (loading) return <div className="page-loading">Chargement…</div>
  if (!stock) return <div className="page">Stock introuvable.</div>

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Tous les stocks
      </Link>
      <div className="page-header">
        <h1>
          {stock.nom}
          {peutModifier && (
            <button
              className="small-button rename-button"
              onClick={() => setRenameTarget({ table: 'stocks', id: stock.id, currentName: stock.nom })}
            >
              ✎ Renommer
            </button>
          )}
          {peutSupprimer && (
            <button
              className="small-button rename-button"
              disabled={deletingStock}
              onClick={handleDeleteStock}
            >
              🗑 Supprimer le stock
            </button>
          )}
        </h1>
        <div className="page-header-actions">
          <button className="secondary-button" onClick={() => setShowDistribution(true)}>
            Sortie distribution
          </button>
          {peutModifier && (
            <button onClick={() => setShowAddProduct(true)}>+ Ajouter un produit</button>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {distributionsEnCours.length > 0 && (
        <section className="distribution-en-cours">
          <h2>Distributions en cours</h2>
          {distributionsEnCours.map((d) => (
            <div className="distribution-card" key={d.id}>
              <span>
                Sortie le {new Date(d.date_sortie).toLocaleString('fr-FR')} par {d.utilisateur_sortie_nom}
                {d.commentaire_sortie && (
                  <>
                    {' — '}
                    <em>{d.commentaire_sortie}</em>
                  </>
                )}
              </span>
              <button className="small-button" onClick={() => setReturnTarget(d)}>
                Reste de distrib
              </button>
            </div>
          ))}
        </section>
      )}

      <input
        className="search-bar"
        type="search"
        placeholder="Rechercher un produit dans ce stock…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {categories.length === 0 && (
        <p className="empty-state">
          Aucune catégorie pour l'instant. Ajoute un produit pour créer la première catégorie.
        </p>
      )}

      {categories.map((cat) => {
        const items = produitsParCategorie.get(cat.id) ?? []
        if (search.trim() && items.length === 0) return null
        return (
          <section key={cat.id} className="category-block">
            <h2>
              {cat.nom}
              {peutModifier && (
                <>
                  <button
                    className="small-button rename-button"
                    onClick={() =>
                      setRenameTarget({ table: 'categories', id: cat.id, currentName: cat.nom })
                    }
                  >
                    ✎ Renommer
                  </button>
                  <button
                    className="small-button rename-button"
                    disabled={deletingCategorieId === cat.id}
                    onClick={() => handleDeleteCategorie(cat)}
                  >
                    🗑 Supprimer
                  </button>
                </>
              )}
            </h2>
            {items.length === 0 ? (
              <p className="empty-state">Aucun produit.</p>
            ) : (
              <div className="table-scroll">
                <table className="produits-table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Quantité</th>
                      <th>Source</th>
                      <th>Péremption</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nom}</td>
                        <td>{p.quantite}</td>
                        <td>{p.source}</td>
                        <td>{p.date_peremption ? formatDate(p.date_peremption) : '—'}</td>
                        <td className="row-actions">
                          {peutModifier && (
                            <>
                              <button
                                className="small-button"
                                onClick={() => setAdjustTarget({ produit: p, type: 'ajout' })}
                              >
                                + Ajouter
                              </button>
                              <button
                                className="small-button"
                                onClick={() => setAdjustTarget({ produit: p, type: 'retrait' })}
                              >
                                − Retirer
                              </button>
                              <button
                                className="small-button"
                                onClick={() =>
                                  setRenameTarget({ table: 'produits', id: p.id, currentName: p.nom })
                                }
                              >
                                ✎ Renommer
                              </button>
                            </>
                          )}
                          {peutTransf && (
                            <button className="small-button" onClick={() => setTransferTarget(p)}>
                              ⇄ Transférer
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}

      {showAddProduct && (
        <AddProductModal
          stockId={stock.id}
          categories={categories}
          produits={produits}
          sources={sources}
          onClose={() => setShowAddProduct(false)}
          onDone={() => {
            setShowAddProduct(false)
            load()
          }}
        />
      )}

      {showDistribution && (
        <DistributionModal
          stockId={stock.id}
          categories={categories}
          produits={produits}
          onClose={() => setShowDistribution(false)}
          onDone={() => {
            setShowDistribution(false)
            load()
          }}
        />
      )}

      {returnTarget && (
        <DistributionReturnModal
          distribution={returnTarget}
          onClose={() => setReturnTarget(null)}
          onDone={() => {
            setReturnTarget(null)
            load()
          }}
        />
      )}

      {adjustTarget && (
        <AdjustQuantityModal
          produit={adjustTarget.produit}
          type={adjustTarget.type}
          sources={sources}
          onClose={() => setAdjustTarget(null)}
          onDone={() => {
            setAdjustTarget(null)
            load()
          }}
        />
      )}

      {transferTarget && (
        <TransferModal
          produit={transferTarget}
          currentStockNom={stock.nom}
          onClose={() => setTransferTarget(null)}
          onDone={() => {
            setTransferTarget(null)
            load()
          }}
        />
      )}

      {renameTarget && (
        <RenameModal
          title={
            renameTarget.table === 'stocks'
              ? 'Renommer le stock'
              : renameTarget.table === 'categories'
                ? 'Renommer la catégorie'
                : 'Renommer le produit'
          }
          currentName={renameTarget.currentName}
          onClose={() => setRenameTarget(null)}
          onSubmit={handleRename}
        />
      )}
    </div>
  )
}
