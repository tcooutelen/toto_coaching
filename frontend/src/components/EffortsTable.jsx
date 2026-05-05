import { useState, useEffect } from "react";
import { api } from "../api";

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
  { key: "7j",     label: "7 jours",  days: 7 },
  { key: "28j",    label: "28 jours", days: 28 },
  { key: "42j",    label: "42 jours", days: 42 },
  { key: "84j",    label: "84 jours", days: 84 },
  { key: "saison", label: "Saison",   season: true },
  { key: "all",    label: "All time", all: true },
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
    { label: "FC (bpm)",       field: "hr",       render: (v) => fmt(v, "bpm") },
    { label: "Cadence (spm)",  field: "cadence",  render: (v) => fmt(v, "spm") },
  ],
};

export default function EffortsTable({ athleteId, athlete, syncKey, sport = "ride" }) {
  const [periodKey, setPeriodKey] = useState(sport === "run" ? "28j" : "all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const period = PERIODS.find((p) => p.key === periodKey);
  const isSeason = period?.season && !athlete.season_start;

  useEffect(() => {
    if (isSeason) return;
    const { oldest, newest } = periodDates(period, athlete);
    setLoading(true);
    setData(null);
    setError(null);
    api.getEfforts(athleteId, oldest, newest, sport)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [athleteId, periodKey, athlete.season_start, syncKey, sport]);

  const rows = ROWS_BY_SPORT[sport] ?? ROWS_BY_SPORT.ride;

  return (
    <div className="efforts-section">
      <div className="efforts-header">
        <h3>Meilleures performances</h3>
        <div className="efforts-period-select">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`period-btn ${periodKey === p.key ? "active" : ""} ${p.season && !athlete.season_start ? "disabled" : ""}`}
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
                  {DURATIONS.map((d) => (
                    <td key={d.secs}>{row.render(data[d.secs]?.[row.field])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
