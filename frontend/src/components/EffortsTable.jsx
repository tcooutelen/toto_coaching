import { useState, useEffect } from "react";
import { api } from "../api";
import ActivityModal from "./ActivityModal";

const DURATIONS = [
  { secs: 5,    label: "5s" },
  { secs: 30,   label: "30s" },
  { secs: 60,   label: "1 min" },
  { secs: 180,  label: "3 min" },
  { secs: 300,  label: "5 min" },
  { secs: 600,  label: "10 min" },
  { secs: 1200, label: "20 min" },
  { secs: 3600, label: "1 h" },
];

const PERIODS = [
  { key: "7j",     label: "7 jours",  days: 7,      color: "#d1fae5" },
  { key: "28j",    label: "28 jours", days: 28,     color: "#ecfccb" },
  { key: "42j",    label: "42 jours", days: 42,     color: "#fef9c3" },
  { key: "84j",    label: "84 jours", days: 84,     color: "#ffedd5" },
  { key: "saison", label: "Saison",   season: true, color: "#ffe4e6" },
  { key: "all",    label: "All time", all: true,    color: "#fee2e2" },
];

function periodDates(period, athlete) {
  if (period.all) return { oldest: null, newest: null };
  if (period.season) return { oldest: athlete.season_start ?? null, newest: null };
  const d = new Date();
  d.setDate(d.getDate() - period.days);
  return { oldest: d.toISOString().slice(0, 10), newest: null };
}

function fmtPace(speedMs) {
  if (speedMs == null || speedMs <= 0) return "—";
  const minPerKm = 1000 / 60 / speedMs;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

function fmt(val, unit = "") {
  if (val == null) return "—";
  const rounded = Number.isInteger(val) ? val : Math.round(val);
  return unit ? `${rounded} ${unit}` : String(rounded);
}

const ROWS_BY_SPORT = {
  ride: [
    { label: "Puissance (W)",  field: "power",   render: (v) => fmt(v, "W")   },
    { label: "FC (bpm)",       field: "hr",       render: (v) => fmt(v, "bpm") },
    { label: "Cadence (rpm)",  field: "cadence",  render: (v) => fmt(v, "rpm") },
  ],
  run: [
    { label: "Allure",         field: "pace",     render: fmtPace              },
    { label: "Puissance (W)",  field: "power",   render: (v) => fmt(v, "W"),  optional: true },
    { label: "FC (bpm)",       field: "hr",       render: (v) => fmt(v, "bpm") },
    { label: "Cadence (spm)",  field: "cadence",  render: (v) => fmt(v, "spm") },
  ],
};

export default function EffortsTable({ athleteId, athlete, syncKey, sport = "ride", activities = [] }) {
  const [periodKey, setPeriodKey] = useState(sport === "run" ? "28j" : "all");
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const period = PERIODS.find((p) => p.key === periodKey);
  const isSeason = period?.season && !athlete.season_start;

  useEffect(() => {
    setLoading(true);
    setAllData({});
    setError(null);

    const fetches = PERIODS
      .filter((p) => !(p.season && !athlete.season_start))
      .map((p) => {
        const { oldest, newest } = periodDates(p, athlete);
        return api.getEfforts(athleteId, oldest, newest, sport)
          .then((d) => [p.key, d])
          .catch(() => [p.key, null]);
      });

    Promise.all(fetches)
      .then((results) => setAllData(Object.fromEntries(results)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [athleteId, athlete.season_start, syncKey, sport]);

  const data = allData[periodKey];
  const allRows = ROWS_BY_SPORT[sport] ?? ROWS_BY_SPORT.ride;
  const rows = allRows.filter(row => {
    if (!row.optional) return true;
    // Show optional rows only if at least one period has a value
    return Object.values(allData).some(d =>
      DURATIONS.some(dur => d?.[dur.secs]?.[row.field]?.value != null)
    );
  });

  function getCellColor(secs, field, val) {
    if (val == null) return undefined;
    for (const p of PERIODS) {
      const pVal = allData[p.key]?.[secs]?.[field]?.value;
      if (pVal != null && Math.abs(pVal - val) <= 0.005) return p.color;
    }
    return PERIODS[PERIODS.length - 1].color;
  }

  function handleCellClick(secs, field) {
    const actId = data?.[secs]?.[field]?.activity_id;
    if (!actId) return;
    const act = activities.find((a) => String(a.id) === String(actId));
    if (act) setSelected(act);
  }

  return (
    <div className="efforts-section">
      <div className="efforts-header">
        <h3>Meilleures performances</h3>
        <div className="efforts-period-select">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`period-btn ${periodKey === p.key ? "active" : ""} ${p.season && !athlete.season_start ? "disabled" : ""}`}
              style={periodKey === p.key ? undefined : { borderLeftColor: p.color, borderLeftWidth: 3 }}
              onClick={() => !(p.season && !athlete.season_start) && setPeriodKey(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isSeason && (
        <p className="stats-hint">Définis un début de saison pour activer cette période.</p>
      )}

      {loading && <p className="loading">Chargement…</p>}
      {error && <p className="error">Erreur : {error}</p>}

      {data && !loading && (
        <div className="efforts-table-wrap">
          <table className="efforts-table">
            <thead>
              <tr>
                <th></th>
                {DURATIONS.map((d) => <th key={d.secs}>{d.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field}>
                  <td className="efforts-row-label">{row.label}</td>
                  {DURATIONS.map((d) => {
                    const cell = data[d.secs]?.[row.field];
                    const val = cell?.value;
                    const actId = cell?.activity_id;
                    const bg = getCellColor(d.secs, row.field, val);
                    return (
                      <td
                        key={d.secs}
                        style={bg ? { backgroundColor: bg } : undefined}
                        className={actId ? "cell-clickable" : ""}
                        onClick={() => actId && handleCellClick(d.secs, row.field)}
                        title={actId ? "Voir l'activité" : undefined}
                      >
                        {row.render(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="efforts-legend">
            {PERIODS.filter((p) => !(p.season && !athlete.season_start)).map((p) => (
              <span key={p.key} className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: p.color }} />
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <ActivityModal
          athleteId={athleteId}
          athlete={athlete}
          activity={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
