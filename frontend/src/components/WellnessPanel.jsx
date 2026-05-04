import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

export default function WellnessPanel({ wellness }) {
  if (wellness.length === 0) {
    return <p className="no-data">Aucune donnée wellness disponible.</p>;
  }

  const data = [...wellness]
    .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
    .map((w) => ({
      date: w.id?.slice(5) ?? "",
      CTL: w.ctl != null ? Math.round(w.ctl) : null,
      ATL: w.atl != null ? Math.round(w.atl) : null,
      TSB: w.ctl != null && w.atl != null ? Math.round(w.ctl - w.atl) : null,
    }));

  const tooltipStyle = {
    contentStyle: { background: "#1a1d27", border: "1px solid #2d3148", borderRadius: 6 },
    labelStyle: { color: "#e2e8f0", marginBottom: 4 },
  };

  return (
    <div className="wellness-charts">
      {/* PMC Chart */}
      <div className="chart-block">
        <h3>Performance Management Chart</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: -10, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="#2d3148" />
            <Line type="monotone" dataKey="CTL" stroke="#7c8cff" strokeWidth={2} dot={false} name="CTL (forme)" />
            <Line type="monotone" dataKey="ATL" stroke="#f97316" strokeWidth={2} dot={false} name="ATL (fatigue)" />
            <Line type="monotone" dataKey="TSB" stroke="#22c55e" strokeWidth={2} dot={false} name="TSB (fraîcheur)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend expliquée */}
      <div className="wellness-legend">
        <div className="wl-item"><span style={{ color: "#7c8cff" }}>CTL</span> — Charge chronique (forme long terme)</div>
        <div className="wl-item"><span style={{ color: "#f97316" }}>ATL</span> — Charge aiguë (fatigue récente)</div>
        <div className="wl-item"><span style={{ color: "#22c55e" }}>TSB</span> — Balance {`(CTL - ATL)`} : positif = frais, négatif = fatigué</div>
      </div>
    </div>
  );
}
