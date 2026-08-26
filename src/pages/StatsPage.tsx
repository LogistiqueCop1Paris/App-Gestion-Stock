import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const MOIS_COMPLETS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

// Palette catégorielle validée (contraste CVD/daltonisme) — voir le skill dataviz.
// Volontairement distincte du corail de l'appli : le corail est déjà utilisé partout
// dans l'interface (boutons, badges), le réutiliser comme couleur de donnée le
// rendrait indiscernable du reste de l'UI.
const COULEURS_SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']

interface DistributionDetail {
  id: string
  stock_id: string
  date_sortie: string
  date_retour: string
  nombre_paniers: number
  commentaire_sortie: string | null
  commentaire_retour: string | null
  utilisateur_sortie_nom: string
  utilisateur_retour_nom: string | null
  stocks: { nom: string } | null
}

interface Stat {
  stockId: string
  stockNom: string
  couleur: string
  parMois: number[] // 12 valeurs, index 0 = janvier
  total: number
}

export default function StatsPage() {
  const [distributions, setDistributions] = useState<DistributionDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [annee, setAnnee] = useState<number>(new Date().getFullYear())
  const [moisSelectionne, setMoisSelectionne] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('distributions')
      .select(
        'id, stock_id, date_sortie, date_retour, nombre_paniers, commentaire_sortie, ' +
          'commentaire_retour, utilisateur_sortie_nom, utilisateur_retour_nom, stocks(nom)'
      )
      .eq('statut', 'terminee')
      .not('nombre_paniers', 'is', null)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          setDistributions((data as unknown as DistributionDetail[]) ?? [])
        }
        setLoading(false)
      })
  }, [])

  const anneesDisponibles = useMemo(() => {
    const set = new Set(distributions.map((d) => new Date(d.date_retour).getFullYear()))
    set.add(new Date().getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [distributions])

  const stats = useMemo<Stat[]>(() => {
    const parStock = new Map<string, Stat>()
    let couleurIndex = 0

    for (const d of distributions) {
      const date = new Date(d.date_retour)
      if (date.getFullYear() !== annee) continue

      let stat = parStock.get(d.stock_id)
      if (!stat) {
        stat = {
          stockId: d.stock_id,
          stockNom: d.stocks?.nom ?? 'Stock supprimé',
          couleur: COULEURS_SERIES[couleurIndex % COULEURS_SERIES.length],
          parMois: new Array(12).fill(0),
          total: 0,
        }
        couleurIndex += 1
        parStock.set(d.stock_id, stat)
      }
      stat.parMois[date.getMonth()] += d.nombre_paniers
      stat.total += d.nombre_paniers
    }

    return [...parStock.values()].sort((a, b) => a.stockNom.localeCompare(b.stockNom))
  }, [distributions, annee])

  const totauxParMois = useMemo(() => {
    const totaux = new Array(12).fill(0)
    for (const s of stats) {
      for (let m = 0; m < 12; m++) totaux[m] += s.parMois[m]
    }
    return totaux
  }, [stats])

  const totalAnnee = totauxParMois.reduce((a, b) => a + b, 0)
  const maxValeur = Math.max(1, ...stats.flatMap((s) => s.parMois))

  const distributionsDuMois = useMemo(() => {
    if (moisSelectionne === null) return []
    return distributions
      .filter((d) => {
        const date = new Date(d.date_retour)
        return date.getFullYear() === annee && date.getMonth() === moisSelectionne
      })
      .sort((a, b) => a.date_retour.localeCompare(b.date_retour))
  }, [distributions, annee, moisSelectionne])

  const totalMoisSelectionne = distributionsDuMois.reduce((sum, d) => sum + d.nombre_paniers, 0)

  function toggleMois(i: number) {
    setMoisSelectionne((prev) => (prev === i ? null : i))
  }

  // --- Graphique SVG (frise sans dépendance externe) ---
  const chartW = 760
  const chartH = 260
  const padL = 42
  const padR = 12
  const padT = 12
  const padB = 28
  const plotW = chartW - padL - padR
  const plotH = chartH - padT - padB
  const xStep = plotW / 11

  function xFor(moisIndex: number) {
    return padL + xStep * moisIndex
  }
  function yFor(valeur: number) {
    return padT + plotH * (1 - valeur / maxValeur)
  }

  const graduationsY = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValeur * f))

  return (
    <div className="page">
      <div className="page-header">
        <h1>Statistiques de fréquentation</h1>
        <select
          value={annee}
          onChange={(e) => {
            setAnnee(Number(e.target.value))
            setMoisSelectionne(null)
          }}
        >
          {anneesDisponibles.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <p className="modal-subtitle">
        Nombre de paniers distribués par lieu, saisi à chaque clôture de distribution — une
        distribution par lieu et par semaine. Clique sur un mois (dans le graphique ou le
        tableau) pour voir le détail.
      </p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Chargement…</p>
      ) : stats.length === 0 ? (
        <p className="empty-state">Aucune distribution clôturée avec des paniers pour {annee}.</p>
      ) : (
        <>
          <div className="stats-chart-wrap">
            <svg
              className="stats-chart"
              viewBox={`0 0 ${chartW} ${chartH}`}
              role="img"
              aria-label={`Évolution du nombre de paniers distribués par lieu en ${annee}`}
            >
              {moisSelectionne !== null && (
                <rect
                  x={xFor(moisSelectionne) - xStep / 2}
                  y={padT}
                  width={xStep}
                  height={plotH}
                  className="stats-chart-mois-surbrillance"
                />
              )}

              {graduationsY.map((g) => (
                <g key={g}>
                  <line
                    x1={padL}
                    x2={chartW - padR}
                    y1={yFor(g)}
                    y2={yFor(g)}
                    className="stats-chart-grid"
                  />
                  <text x={padL - 8} y={yFor(g)} className="stats-chart-axis-label" textAnchor="end" dy="0.32em">
                    {g}
                  </text>
                </g>
              ))}

              {MOIS_LABELS.map((label, i) => (
                <g
                  key={label}
                  className="stats-chart-mois-label"
                  onClick={() => toggleMois(i)}
                  tabIndex={0}
                  role="button"
                  aria-pressed={moisSelectionne === i}
                  aria-label={`Détail de ${MOIS_COMPLETS[i]} ${annee}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleMois(i)
                    }
                  }}
                >
                  {/* Zone cliquable agrandie, invisible */}
                  <rect x={xFor(i) - xStep / 2} y={chartH - padB} width={xStep} height={padB} fill="transparent" />
                  <text
                    x={xFor(i)}
                    y={chartH - 6}
                    className={
                      'stats-chart-axis-label' + (moisSelectionne === i ? ' is-selectionne' : '')
                    }
                    textAnchor="middle"
                  >
                    {label}
                  </text>
                </g>
              ))}

              {stats.map((s) => (
                <g key={s.stockId}>
                  <polyline
                    points={s.parMois.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ')}
                    fill="none"
                    stroke={s.couleur}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s.parMois.map((v, i) => (
                    <g key={i}>
                      {/* Cible de survol agrandie (invisible) : le marqueur visible fait
                          8px, mais la zone cliquable/survolable doit être plus grande. */}
                      <circle
                        cx={xFor(i)}
                        cy={yFor(v)}
                        r={12}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onClick={() => toggleMois(i)}
                      >
                        <title>
                          {s.stockNom} — {MOIS_LABELS[i]} {annee} : {v} panier(s)
                        </title>
                      </circle>
                      <circle
                        cx={xFor(i)}
                        cy={yFor(v)}
                        r={4}
                        fill={s.couleur}
                        strokeWidth={2}
                        style={{ stroke: 'var(--surface)' }}
                      />
                    </g>
                  ))}
                </g>
              ))}
            </svg>
          </div>

          <div className="stats-legend">
            {stats.map((s) => (
              <span className="stats-legend-item" key={s.stockId}>
                <span className="stats-legend-swatch" style={{ background: s.couleur }} />
                {s.stockNom} <em>({s.total} sur l'année)</em>
              </span>
            ))}
          </div>

          <div className="table-scroll">
            <table className="produits-table">
              <thead>
                <tr>
                  <th>Mois</th>
                  {stats.map((s) => (
                    <th key={s.stockId}>{s.stockNom}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {MOIS_LABELS.map((label, i) => (
                  <tr
                    key={label}
                    className={
                      'stats-table-row-cliquable' + (moisSelectionne === i ? ' is-selectionne' : '')
                    }
                    onClick={() => toggleMois(i)}
                  >
                    <td>{label}</td>
                    {stats.map((s) => (
                      <td key={s.stockId}>{s.parMois[i]}</td>
                    ))}
                    <td>
                      <strong>{totauxParMois[i]}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <strong>Total {annee}</strong>
                  </td>
                  {stats.map((s) => (
                    <td key={s.stockId}>
                      <strong>{s.total}</strong>
                    </td>
                  ))}
                  <td>
                    <strong>{totalAnnee}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {moisSelectionne !== null && (
            <section className="stats-detail">
              <div className="stats-detail-header">
                <h2>
                  Détail — {MOIS_COMPLETS[moisSelectionne]} {annee}
                </h2>
                <button className="small-button" onClick={() => setMoisSelectionne(null)}>
                  ✕ Fermer
                </button>
              </div>

              {distributionsDuMois.length === 0 ? (
                <p className="empty-state">Aucune distribution clôturée ce mois-ci.</p>
              ) : (
                <>
                  <div className="stats-detail-summary">
                    <div className="stats-detail-stat">
                      <span className="stats-detail-stat-value">{distributionsDuMois.length}</span>
                      <span className="stats-detail-stat-label">distribution(s)</span>
                    </div>
                    <div className="stats-detail-stat">
                      <span className="stats-detail-stat-value">{totalMoisSelectionne}</span>
                      <span className="stats-detail-stat-label">paniers au total</span>
                    </div>
                    <div className="stats-detail-stat">
                      <span className="stats-detail-stat-value">
                        {(totalMoisSelectionne / distributionsDuMois.length).toFixed(1)}
                      </span>
                      <span className="stats-detail-stat-label">paniers en moyenne</span>
                    </div>
                  </div>

                  <div className="table-scroll">
                    <table className="produits-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Lieu</th>
                          <th>Paniers</th>
                          <th>Sortie par</th>
                          <th>Clôturée par</th>
                          <th>Commentaires</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distributionsDuMois.map((d) => (
                          <tr key={d.id}>
                            <td>{new Date(d.date_retour).toLocaleDateString('fr-FR')}</td>
                            <td>{d.stocks?.nom ?? 'Stock supprimé'}</td>
                            <td>{d.nombre_paniers}</td>
                            <td>{d.utilisateur_sortie_nom}</td>
                            <td>{d.utilisateur_retour_nom ?? '—'}</td>
                            <td>
                              {d.commentaire_sortie && <div>Sortie : {d.commentaire_sortie}</div>}
                              {d.commentaire_retour && <div>Reste : {d.commentaire_retour}</div>}
                              {!d.commentaire_sortie && !d.commentaire_retour && '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
