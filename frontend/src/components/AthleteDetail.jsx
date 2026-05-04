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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [showRefresh, setShowRefresh] = useState(false);
  const [hasData, setHasData] = useState(null);

  const fetchLocal = useCallback((oldest, newest) => {
    setError(null);
    setLoading(true);
    Promise.all([
      api.getActivities(athlete.id, oldest, newest),
      api.getWellness(athlete.id, oldest, newest),
    ])
      .then(([acts, well]) => {
        setActivities(acts);
        setWellness(well);
        setHasData(acts.length > 0 || well.length > 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [athlete.id]);

  useEffect(() => {
    setActivities([]);
    setWellness([]);
    setHasData(null);
    fetchLocal(offsetDate(-365), offsetDate(0));
  }, [athlete.id, fetchLocal]);

  async function handleRefresh(oldest, newest) {
    setShowRefresh(false);
    setError(null);
    setSyncing(true);
    try {
      await api.syncAthlete(athlete.id, oldest, newest);
      fetchLocal(oldest, newest);
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="athlete-detail">
      <div className="detail-header">
        <h2>{athlete.name}</h2>
        <button className="btn-refresh" onClick={() => setShowRefresh(true)} disabled={syncing}>
          {syncing ? "Synchronisation…" : "↻ Rafraîchir"}
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

      {(loading || syncing) && <p className="loading">{syncing ? "Synchronisation en cours…" : "Chargement…"}</p>}
      {error && <p className="error">Erreur : {error}</p>}

      {!loading && !syncing && !error && hasData === false && (
        <div className="no-data-hint">
          <p>Aucune donnée en base. Clique sur <strong>↻ Rafraîchir</strong> pour importer depuis intervals.icu.</p>
        </div>
      )}

      {!loading && !syncing && !error && hasData && tab === "Activités" && (
        <ActivityList athleteId={athlete.id} activities={activities} />
      )}
      {!loading && !syncing && !error && hasData && tab === "Wellness" && (
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
