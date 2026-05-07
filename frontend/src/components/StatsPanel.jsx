function fmt(val, unit = "") {
  if (val == null || (val === 0 && unit !== "")) return "—";
  return unit ? `${val}${unit}` : val;
}

export default function StatsPanel({ athlete, periodStats }) {
  const periods = [
    { key: "7j",     label: "7 jours" },
    { key: "28j",    label: "28 jours" },
    { key: "42j",    label: "42 jours" },
    { key: "84j",    label: "84 jours" },
    { key: "saison", label: "Saison", disabled: !athlete.season_start },
    { key: "all",    label: "All time" },
  ];

  const rows = [
    { label: "Activités",    render: (p) => fmt(p?.count) },
    { label: "Distance",     render: (p) => fmt(p?.distance_km, " km") },
    { label: "Durée",        render: (p) => fmt(p?.duration_h, " h") },
    { label: "Charge (TSS)", render: (p) => fmt(p?.tss) },
  ];

  return (
    <div className="stats-panel">
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
                    {p.disabled ? "—" : row.render(periodStats?.[p.key])}
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
  );
}
