import { useState, useMemo } from "react";
import ActivityModal from "./ActivityModal";

const TYPE_LABELS = {
  Ride: "Vélo",
  Run: "Course",
  Swim: "Natation",
  VirtualRide: "Vélo (virtuel)",
  Walk: "Marche",
};

const TYPE_ICONS = {
  Ride: "🚴", Run: "🏃", Swim: "🏊", VirtualRide: "🚴", Walk: "🚶",
};

function formatDuration(seconds) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`;
}

function formatDistance(meters) {
  if (!meters) return "-";
  return (meters / 1000).toFixed(1) + " km";
}

const ALL_TYPES = ["Ride", "VirtualRide", "Run", "Swim", "Walk"];

export default function ActivityList({ athleteId, activities }) {
  const [selected, setSelected] = useState(null);
  const [filterType, setFilterType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const types = useMemo(() => {
    const found = new Set(activities.map((a) => a.type).filter(Boolean));
    return ALL_TYPES.filter((t) => found.has(t));
  }, [activities]);

  const filtered = useMemo(() => {
    return activities.filter((a) => {
      if (filterType && a.type !== filterType) return false;
      const date = a.start_date_local?.slice(0, 10) ?? "";
      if (filterFrom && date < filterFrom) return false;
      if (filterTo && date > filterTo) return false;
      return true;
    });
  }, [activities, filterType, filterFrom, filterTo]);

  if (activities.length === 0) {
    return <p className="no-data">Aucune activité. Lance une synchronisation via ↻ Rafraîchir.</p>;
  }

  return (
    <>
      <div className="filters">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="filter-select"
        >
          <option value="">Tous les types</option>
          {types.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
          ))}
        </select>

        <label className="filter-date">
          Du
          <input
            type="date"
            value={filterFrom}
            max={filterTo || undefined}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </label>

        <label className="filter-date">
          Au
          <input
            type="date"
            value={filterTo}
            min={filterFrom || undefined}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </label>

        {(filterType || filterFrom || filterTo) && (
          <button
            className="btn-clear-filters"
            onClick={() => { setFilterType(""); setFilterFrom(""); setFilterTo(""); }}
          >
            ✕ Effacer
          </button>
        )}

        <span className="filter-count">{filtered.length} activité{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {filtered.length === 0 ? (
        <p className="no-data">Aucune activité ne correspond aux filtres.</p>
      ) : (
        <table className="activity-table clickable">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Nom</th>
              <th>Distance</th>
              <th>Durée</th>
              <th>TSS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} onClick={() => setSelected(a)} title="Cliquer pour le détail">
                <td>{a.start_date_local?.slice(0, 10) ?? "-"}</td>
                <td>{TYPE_ICONS[a.type] ?? ""} {TYPE_LABELS[a.type] ?? a.type ?? "-"}</td>
                <td>{a.name ?? "-"}</td>
                <td>{formatDistance(a.distance)}</td>
                <td>{formatDuration(a.moving_time ?? a.elapsed_time)}</td>
                <td>{a.icu_training_load ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <ActivityModal
          athleteId={athleteId}
          activity={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
