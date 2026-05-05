import { useMemo } from "react";
import ActivityList from "./ActivityList";
import EffortsTable from "./EffortsTable";

const PERIODS = [
  { key: "7j",     label: "7 jours",  getDays: () => 7 },
  { key: "28j",    label: "28 jours", getDays: () => 28 },
  { key: "42j",    label: "42 jours", getDays: () => 42 },
  { key: "84j",    label: "84 jours", getDays: () => 84 },
  { key: "saison", label: "Saison",   season: true },
  { key: "all",    label: "All time", all: true },
];

function periodActivities(activities, period, athlete) {
  if (period.all) return activities;
  if (period.season) {
    if (!athlete.season_start) return null;
    return activities.filter((a) => (a.start_date_local ?? "") >= athlete.season_start);
  }
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - period.getDays());
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return activities.filter((a) => (a.start_date_local ?? "") >= cutoffStr);
}

function computeStats(acts, sport) {
  if (!acts) return null;
  const filtered = acts.filter((a) => sport.types.includes(a.type));
  const count = filtered.length;
  const distance = filtered.reduce((s, a) => s + (a.distance || 0), 0) / 1000;
  const duration = filtered.reduce((s, a) => s + (a.moving_time || a.elapsed_time || 0), 0) / 3600;
  const tss = filtered.reduce((s, a) => s + (a.icu_training_load || 0), 0);

  let extra = {};
  if (sport.id === "velo") {
    const withPower = filtered.filter((a) => a.icu_average_watts);
    extra.avgWatts = withPower.length
      ? Math.round(withPower.reduce((s, a) => s + a.icu_average_watts, 0) / withPower.length)
      : null;
    const withNP = filtered.filter((a) => a.icu_weighted_avg_watts);
    extra.avgNP = withNP.length
      ? Math.round(withNP.reduce((s, a) => s + a.icu_weighted_avg_watts, 0) / withNP.length)
      : null;
  }
  if (sport.id === "course") {
    const withSpeed = filtered.filter((a) => a.average_speed > 0);
    if (withSpeed.length) {
      const avgSpeed = withSpeed.reduce((s, a) => s + a.average_speed, 0) / withSpeed.length;
      const minPerKm = 1000 / 60 / avgSpeed;
      const m = Math.floor(minPerKm);
      const s = Math.round((minPerKm - m) * 60);
      extra.avgPace = `${m}:${String(s).padStart(2, "0")}`;
    } else {
      extra.avgPace = null;
    }
  }

  return { count, distance: Math.round(distance * 10) / 10, duration: Math.round(duration * 10) / 10, tss: Math.round(tss), ...extra };
}

function fmt(val, unit = "") {
  if (val == null) return "—";
  if (val === 0 && unit) return "—";
  return unit ? `${val} ${unit}` : String(val);
}

export default function SportTab({ sport, activities, athlete, athleteId, syncKey }) {
  const periodStats = useMemo(() => {
    return PERIODS.map((p) => ({
      ...p,
      stats: computeStats(periodActivities(activities, p, athlete), sport),
    }));
  }, [activities, athlete, sport]);

  const sportActivities = useMemo(
    () => activities.filter((a) => sport.types.includes(a.type)),
    [activities, sport]
  );

  const rows = [
    { label: "Activités",  render: (s) => fmt(s.count) },
    { label: "Distance",   render: (s) => fmt(s.distance, "km") },
    { label: "Durée",      render: (s) => fmt(s.duration, "h") },
    { label: "TSS total",  render: (s) => fmt(s.tss) },
    ...(sport.id === "velo" ? [
      { label: "Puiss. moy.",  render: (s) => fmt(s.avgWatts, "W") },
      { label: "NP moy.",      render: (s) => fmt(s.avgNP, "W") },
    ] : []),
    ...(sport.id === "course" ? [
      { label: "Allure moy.", render: (s) => (s.avgPace ? `${s.avgPace} /km` : "—") },
    ] : []),
  ];

  return (
    <div className="sport-tab">
      <div className="sport-stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th></th>
              {periodStats.map((p) => (
                <th key={p.key} className={p.stats === null ? "disabled" : ""}>
                  {p.label}
                  {p.season && athlete.season_start && (
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
                {periodStats.map((p) => (
                  <td key={p.key} className={p.stats === null ? "disabled" : ""}>
                    {p.stats === null ? "—" : row.render(p.stats)}
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

      {sport.id === "velo" && (
        <EffortsTable athleteId={athleteId} athlete={athlete} syncKey={syncKey} sport="ride" />
      )}
      {sport.id === "course" && (
        <EffortsTable athleteId={athleteId} athlete={athlete} syncKey={syncKey} sport="run" />
      )}

      <div className="sport-activity-list">
        <ActivityList athleteId={athleteId} activities={sportActivities} />
      </div>
    </div>
  );
}
