const TYPE_LABELS = {
  Ride: "Velo",
  Run: "Course",
  Swim: "Natation",
  VirtualRide: "Velo (virtuel)",
  Walk: "Marche",
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

export default function ActivityList({ activities }) {
  if (activities.length === 0) {
    return <p className="no-data">Aucune activité sur les 30 derniers jours.</p>;
  }

  return (
    <table className="activity-table">
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
          <tr key={a.id}>
            <td>{a.start_date_local?.slice(0, 10) ?? "-"}</td>
            <td>{TYPE_LABELS[a.type] ?? a.type ?? "-"}</td>
            <td>{a.name ?? "-"}</td>
            <td>{formatDistance(a.distance)}</td>
            <td>{formatDuration(a.moving_time ?? a.elapsed_time)}</td>
            <td>{a.icu_training_load ?? a.tss ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
