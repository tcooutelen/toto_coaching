import { useState } from "react";
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

export default function ActivityList({ athleteId, activities }) {
  const [selected, setSelected] = useState(null);

  if (activities.length === 0) {
    return <p className="no-data">Aucune activité sur les 30 derniers jours.</p>;
  }

  return (
    <>
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
          {activities.map((a) => (
            <tr key={a.id} onClick={() => setSelected(a)} title="Cliquer pour le détail">
              <td>{a.start_date_local?.slice(0, 10) ?? "-"}</td>
              <td>{TYPE_ICONS[a.type] ?? ""} {TYPE_LABELS[a.type] ?? a.type ?? "-"}</td>
              <td>{a.name ?? "-"}</td>
              <td>{formatDistance(a.distance)}</td>
              <td>{formatDuration(a.moving_time ?? a.elapsed_time)}</td>
              <td>{a.icu_training_load ?? a.tss ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
