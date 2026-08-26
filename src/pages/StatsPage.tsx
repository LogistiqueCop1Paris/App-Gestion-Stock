import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

// Palette catégorielle validée (contraste CVD/daltonisme) — voir le skill dataviz.
// Volontairement distincte du corail de l'appli : le corail est déjà utilisé partout
// dans l'interface (boutons, badges), le réutiliser comme couleur de donnée le
// rendrait indiscernable du reste de l'UI.
const COULEURS_SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']

interface DistributionAvecStock {
  stock_id: string
  date_retour: string
  nombre_paniers: number
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
  const [distributions, setDistributions] = useState<DistributionAvecStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [annee, setAnnee] = useState<number>(new Date().getFullYear())

  useEffect(() => {
    supabase
      .from('distributions')
      .select('stock_id, date_retour, nombre_paniers, stocks(nom)')
      .eq('statut', 'terminee')
      .not('nombre_paniers', 'is', null)
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          setDistributions((data as unknown as DistributionAvecStock[]) ?? [])
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
        <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))}>
          {anneesDisponibles.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <p className="modal-subtitle">
        Nombre de paniers distribués par lieu, saisi à chaque clôture de distribution — une
        distribution par lieu et par semaine.
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
                <text
                  key={label}
                  x={xFor(i)}
                  y={chartH - 6}
                  className="stats-chart-axis-label"
                  textAnchor="middle"
                >
                  {label}
                </text>
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
                      <circle cx={xFor(i)} cy={yFor(v)} r={12} fill="transparent">
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
                  <tr key={label}>
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
        </>
      )}
    </div>
  )
}
