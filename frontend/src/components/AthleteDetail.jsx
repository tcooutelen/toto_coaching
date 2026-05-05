import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import SportTab from "./SportTab";
import WellnessPanel from "./WellnessPanel";
import RefreshModal from "./RefreshModal";
import StatsPanel from "./StatsPanel";

const SPORTS = [
  { id: "velo",     label: "🚴 Vélo",     types: ["Ride", "VirtualRide"] },
  { id: "course",   label: "🏃 Course",   types: ["Run", "Walk"] },
  { id: "natation", label: "🏊 Natation", types: ["Swim"] },
];

const TABS = [...SPORTS.map((s) => s.id), "wellness"];

export default function AthleteDetail({ athlete }) {
  const [tab, setTab] = useState("velo");
  const [activities, setActivities] = useState([]);
  const [wellness, setWellness] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [showRefresh, setShowRefresh] = useState(false);
  const [hasData, setHasData] = useState(null);
  const [syncKey, setSyncKey] = useState(0);

  const fetchLocal = useCallback(() => {
    setError(null);
    setLoading(true);
    Promise.all([
      api.getActivities(athlete.id),
      api.getWellness(athlete.id),
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
    fetchLocal();
  }, [athlete.id, fetchLocal]);

  async function handleRefresh(oldest, newest) {
    setShowRefresh(false);
    setError(null);
    setSyncing(true);
    try {
      await api.syncAthlete(athlete.id, oldest, newest);
      setSyncKey((k) => k + 1);
      fetchLocal();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  const currentSport = SPORTS.find((s) => s.id === tab);

  return (
    <div className="athlete-detail">
      <div className="detail-header">
        <h2>{athlete.name}</h2>
        <button className="btn-refresh" onClick={() => setShowRefresh(true)} disabled={syncing}>
          {syncing ? "Synchronisation…" : "↻ Rafraîchir"}
        </button>
      </div>

      <StatsPanel athlete={athlete} />

      <div className="tabs">
        {SPORTS.map((s) => (
          <button
            key={s.id}
            className={`tab ${tab === s.id ? "active" : ""}`}
            onClick={() => setTab(s.id)}
          >
            {s.label}
          </button>
        ))}
        <button
          className={`tab ${tab === "wellness" ? "active" : ""}`}
          onClick={() => setTab("wellness")}
        >
          Wellness
        </button>
      </div>

      {(loading || syncing) && (
        <p className="loading">{syncing ? "Synchronisation en cours…" : "Chargement…"}</p>
      )}
      {error && <p className="error">Erreur : {error}</p>}

      {!loading && !syncing && !error && hasData === false && (
        <div className="no-data-hint">
          <p>Aucune donnée en base. Clique sur <strong>↻ Rafraîchir</strong> pour importer depuis intervals.icu.</p>
        </div>
      )}

      {!loading && !syncing && !error && hasData && currentSport && (
        <SportTab
          key={tab}
          sport={currentSport}
          activities={activities}
          athlete={athlete}
          athleteId={athlete.id}
          syncKey={syncKey}
        />
      )}

      {!loading && !syncing && !error && hasData && tab === "wellness" && (
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
