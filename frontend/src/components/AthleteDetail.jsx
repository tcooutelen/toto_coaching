import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import ActivityList from "./ActivityList";
import WellnessPanel from "./WellnessPanel";
import RefreshModal from "./RefreshModal";

const TABS = ["Activités", "Wellness"];

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function AthleteDetail({ athlete }) {
  const [tab, setTab] = useState("Activités");
  const [activities, setActivities] = useState([]);
  const [wellness, setWellness] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRefresh, setShowRefresh] = useState(false);

  const fetchData = useCallback((oldest, newest) => {
    setError(null);
    setLoading(true);
    Promise.all([
      api.getActivities(athlete.id, oldest, newest),
      api.getWellness(athlete.id),
    ])
      .then(([acts, well]) => {
        setActivities(acts);
        setWellness(well);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [athlete.id]);

  useEffect(() => {
    setActivities([]);
    setWellness([]);
    fetchData(offsetDate(-6), offsetDate(0));
  }, [athlete.id, fetchData]);

  function handleRefresh(oldest, newest) {
    setShowRefresh(false);
    fetchData(oldest, newest);
  }

  return (
    <div className="athlete-detail">
      <div className="detail-header">
        <h2>{athlete.name}</h2>
        <button className="btn-refresh" onClick={() => setShowRefresh(true)}>
          ↻ Rafraîchir
        </button>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <p className="loading">Chargement...</p>}
      {error && <p className="error">Erreur : {error}</p>}

      {!loading && !error && tab === "Activités" && (
        <ActivityList athleteId={athlete.id} activities={activities} />
      )}
      {!loading && !error && tab === "Wellness" && (
        <WellnessPanel wellness={wellness} />
      )}

      {showRefresh && (
        <RefreshModal
          onConfirm={handleRefresh}
          onClose={() => setShowRefresh(false)}
        />
      )}
    </div>
  );
}
