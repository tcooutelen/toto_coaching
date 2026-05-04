export default function WellnessPanel({ wellness }) {
  if (wellness.length === 0) {
    return <p className="no-data">Aucune donnée wellness disponible.</p>;
  }

  const sorted = [...wellness].sort((a, b) => b.id?.localeCompare(a.id ?? "") ?? 0);

  return (
    <table className="activity-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>CTL</th>
          <th>ATL</th>
          <th>TSB</th>
          <th>HRV</th>
          <th>Sommeil (h)</th>
          <th>Fatigue</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((w) => (
          <tr key={w.id}>
            <td>{w.id ?? "-"}</td>
            <td>{w.ctl != null ? Math.round(w.ctl) : "-"}</td>
            <td>{w.atl != null ? Math.round(w.atl) : "-"}</td>
            <td>
              <span className={tsbClass(w.tsb)}>
                {w.tsb != null ? Math.round(w.tsb) : "-"}
              </span>
            </td>
            <td>{w.hrv ?? "-"}</td>
            <td>{w.sleepSecs != null ? (w.sleepSecs / 3600).toFixed(1) : "-"}</td>
            <td>{w.fatigue ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function tsbClass(tsb) {
  if (tsb == null) return "";
  if (tsb > 10) return "tsb-fresh";
  if (tsb < -20) return "tsb-tired";
  return "tsb-ok";
}
