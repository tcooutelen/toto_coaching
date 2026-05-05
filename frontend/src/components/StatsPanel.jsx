import { useState, useEffect } from "react";
import { api } from "../api";

function fmt(val, unit = "") {
  if (val == null || val === 0 && unit !== "") return "—";
  return unit ? `${val}${unit}` : val;
}

function tsbClass(tsb) {
  if (tsb == null) return "";
  if (tsb > 5) return "tsb-fresh";
  if (tsb < -10) return "tsb-tired";
  return "tsb-ok";
}

export default function StatsPanel({ athlete }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    setStats(null);
    api.getStats(athlete.id).then(setStats).catch(console.error);
  }, [athlete.id]);

  if (!stats) return null;

  const periods = [
    { key: "42j",    label: "42 jours" },
    { key: "84j",    label: "84 jours" },
    { key: "saison", label: "Saison", disabled: !athlete.season_start },
    { key: "all",    label: "All time" },
  ];

  const rows = [
    { label: "Activités",      render: (p) => fmt(p.count) },
    { label: "Distance",       render: (p) => fmt(p.distance_km, " km") },
    { label: "Durée",          render: (p) => fmt(p.duration_h, " h") },
    { label: "Charge (TSS)",   render: (p) => fmt(p.tss) },
  ];

  return (
    <div className="stats-panel">
      <div className="stats-grid">
        {/* PMC actuel */}
        {stats.current && (
          <div className="pmc-current">
            <div className="pmc-item">
              <span className="pmc-label">CTL</span>
              <span className="pmc-value" style={{ color: "#4f6ef7" }}>{stats.current.ctl}</span>
            </div>
            <div className="pmc-item">
              <span className="pmc-label">ATL</span>
              <span className="pmc-value" style={{ color: "#f97316" }}>{stats.current.atl}</span>
            </div>
            <div className="pmc-item">
              <span className="pmc-label">TSB</span>
              <span className={`pmc-value ${tsbClass(stats.current.tsb)}`}>{stats.current.tsb > 0 ? "+" : ""}{stats.current.tsb}</span>
            </div>
            <div className="pmc-date">au {stats.current.date}</div>
          </div>
        )}

        {/* Tableau périodes */}
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th></th>
                {periods.map((p) => (
                  <th key={p.key} className={p.disabled ? "disabled" : ""}>
                    {p.label}
                    {p.key === "saison" && athlete.season_start && (
                      <div className="period-sub">{athlete.season_start}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="stats-row-label">{row.label}</td>
                  {periods.map((p) => (
                    <td key={p.key} className={p.disabled ? "disabled" : ""}>
                      {p.disabled ? "—" : row.render(stats[p.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!athlete.season_start && (
            <p className="stats-hint">Définis un début de saison via ✎ Modifier pour activer la colonne Saison.</p>
          )}
        </div>
      </div>
    </div>
  );
}
