import { useState, useEffect } from "react";
import { api } from "../api";
import ActivityList from "./ActivityList";
import WellnessPanel from "./WellnessPanel";

const TABS = ["Activités", "Wellness"];

export default function AthleteDetail({ athlete }) {
  const [tab, setTab] = useState("Activités");
  const [activities, setActivities] = useState([]);
  const [wellness, setWellness] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setActivities([]);
    setWellness([]);
    setError(null);
    setLoading(true);

    Promise.all([
      api.getActivities(athlete.id),
      api.getWellness(athlete.id),
    ])
      .then(([acts, well]) => {
        setActivities(acts);
        setWellness(well);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [athlete.id]);

  return (
    <div className="athlete-detail">
      <h2>{athlete.name}</h2>

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
        <ActivityList activities={activities} />
      )}
      {!loading && !error && tab === "Wellness" && (
        <WellnessPanel wellness={wellness} />
      )}
    </div>
  );
}
