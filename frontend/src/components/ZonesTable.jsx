import { useState, useEffect, useMemo } from "react";
import { api } from "../api";
import ActivityModal from "./ActivityModal";

const PERIODS = [
  { key: "7j",     label: "7j",     days: 7,      color: "#d1fae5" },
  { key: "28j",    label: "28j",    days: 28,     color: "#ecfccb" },
  { key: "42j",    label: "42j",    days: 42,     color: "#fef9c3" },
  { key: "84j",    label: "84j",    days: 84,     color: "#ffedd5" },
  { key: "saison", label: "Saison", season: true, color: "#ffe4e6" },
  { key: "all",    label: "All",    all: true,    color: "#fee2e2" },
];

function periodDates(period, athlete) {
  if (period.all) return { oldest: null, newest: null };
  if (period.season) return { oldest: athlete.season_start ?? null, newest: null };
  const d = new Date();
  d.setDate(d.getDate() - period.days);
  return { oldest: d.toISOString().slice(0, 10), newest: null };
}

function mpsToMinKm(mps) {
  if (!mps || mps <= 0) return null;
  const minPerKm = 1000 / 60 / mps;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const METRIC_DEFS = [
  { key: "watts",           label: "Puissance", fmt: v => `${Math.round(v)} W`,                          sports: ["ride", "run"] },
  { key: "velocity_smooth", label: "Allure",    fmt: v => mpsToMinKm(v) ? `${mpsToMinKm(v)} /km` : "—", sports: ["run"] },
  { key: "heartrate",       label: "FC",        fmt: v => `${Math.round(v)} bpm`,                        sports: ["ride", "run"] },
];

export default function ZonesTable({ athleteId, athlete, sport, syncKey, activities = [] }) {
  const [periodKey, setPeriodKey] = useState("28j");
  const [config, setConfig] = useState(null);
  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [fetchKey, setFetchKey] = useState(0);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => null);
  }, []);

  const presets = useMemo(() => {
    if (!config?.performance) return [];
    return config.performance.flatMap(({ duration_min, blocs, max_blocs }) => {
      const list = blocs?.length ? blocs : max_blocs ? [max_blocs] : [];
      return list.map(b => ({ duration_min, blocs: b, key: `${duration_min}_${b}` }));
    });
  }, [config]);

  useEffect(() => {
    if (!presets.length) return;
    setLoading(true);
    setAllData({});

    const fetches = PERIODS
      .filter(p => !(p.season && !athlete.season_start))
      .map(p => {
        const { oldest, newest } = periodDates(p, athlete);
        return api.getZoneBests(athleteId, oldest, newest, sport)
          .then(d => [p.key, d])
          .catch(() => [p.key, {}]);
      });

    Promise.all(fetches)
      .then(results => setAllData(Object.fromEntries(results)))
      .finally(() => setLoading(false));
  }, [athleteId, presets, sport, syncKey, athlete.season_start, fetchKey]);

  const activeMetrics = METRIC_DEFS.filter(m => m.sports.includes(sport));
  const period = PERIODS.find(p => p.key === periodKey);
  const data = allData[periodKey] ?? {};

  function getCellColor(presetKey, metricKey, val) {
    if (val == null) return undefined;
    for (const p of PERIODS) {
      const pVal = allData[p.key]?.[presetKey]?.[metricKey]?.value;
      if (pVal != null && Math.abs(pVal - val) <= 0.005) return p.color;
    }
    return PERIODS[PERIODS.length - 1].color;
  }

  function handleCellClick(presetKey, metricKey) {
    const actId = data[presetKey]?.[metricKey]?.activity_id;
    if (!actId) return;
    const act = activities.find(a => String(a.id) === String(actId));
    if (act) setSelected(act);
  }

  async function handleRefresh() {
    if (!period) return;
    const { oldest, newest } = periodDates(period, athlete);
    setRefreshing(true);
    try {
      await api.fetchStreams(athleteId, oldest, newest, sport);
      setFetchKey(k => k + 1);
    } finally {
      setRefreshing(false);
    }
  }

  if (!presets.length && !loading) return null;

  return (
    <div className="zones-main-section">
      <div className="zones-main-header">
        <h3>Zones de travail</h3>
        <div className="zones-main-controls">
          <div className="efforts-period-select">
            {PERIODS.map(p => (
              <button
                key={p.key}
                className={`period-btn${periodKey === p.key ? " active" : ""}${p.season && !athlete.season_start ? " disabled" : ""}`}
                style={periodKey === p.key ? undefined : { borderLeftColor: p.color, borderLeftWidth: 3 }}
                onClick={() => !(p.season && !athlete.season_start) && setPeriodKey(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            className="btn-zone-refresh"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title="Charger les streams pour toutes les activités de cette période"
          >
            {refreshing ? "Chargement…" : "↻ Tout calculer"}
          </button>
        </div>
      </div>

      {(loading || refreshing) && (
        <p className="loading">{refreshing ? "Chargement des streams…" : "Calcul en cours…"}</p>
      )}

      {!loading && !refreshing && (
        <div className="zones-table-wrap">
          <table className="zones-table">
            <thead>
              <tr>
                <th></th>
                {presets.map(({ duration_min, blocs, key }) => (
                  <th key={key}>
                    <span className="zones-th-dur">{duration_min} min</span>
                    <span className="zones-th-blocs">× {blocs}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeMetrics.map(def => (
                <tr key={def.key}>
                  <td className="zones-row-label">{def.label}</td>
                  {presets.map(({ key }) => {
                    const cell = data[key]?.[def.key];
                    const val = cell?.value;
                    const actId = cell?.activity_id;
                    const bg = getCellColor(key, def.key, val);
                    return (
                      <td
                        key={key}
                        className={`zones-cell${actId ? " cell-clickable" : ""}`}
                        style={bg ? { backgroundColor: bg } : undefined}
                        onClick={() => actId && handleCellClick(key, def.key)}
                        title={actId ? "Voir l'activité" : undefined}
                      >
                        {val != null ? def.fmt(val) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="efforts-legend">
            {PERIODS.filter(p => !(p.season && !athlete.season_start)).map(p => (
              <span key={p.key} className="legend-item">
                <span className="legend-dot" style={{ backgroundColor: p.color }} />
                {p.label}
              </span>
            ))}
          </div>
          {!Object.keys(data).length && (
            <p className="stats-hint">
              Aucune activité avec données de stream dans cette période.
              Clique sur <strong>↻ Tout calculer</strong> pour charger les streams.
            </p>
          )}
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
