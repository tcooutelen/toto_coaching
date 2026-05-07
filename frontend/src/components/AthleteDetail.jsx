import { useState, useEffect, useCallback } from "react";
import { api } from "../api";
import SportTab from "./SportTab";
import WellnessPanel from "./WellnessPanel";
import RefreshModal from "./RefreshModal";

function tsbClass(tsb) {
  if (tsb == null) return "";
  if (tsb > 5) return "tsb-fresh";
  if (tsb < -10) return "tsb-tired";
  return "tsb-ok";
}

const SPORTS = [
  { id: "velo",     label: "🚴 Vélo",     types: ["Ride", "VirtualRide"] },
  { id: "course",   label: "🏃 Course",   types: ["Run", "Walk"] },
  { id: "natation", label: "🏊 Natation", types: ["Swim"] },
];


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
  const [current, setCurrent] = useState(null);

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
    setCurrent(null);
    fetchLocal();
    api.getStats(athlete.id).then(d => setCurrent(d.current ?? null)).catch(() => null);
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
        {current && (
          <div className="header-pmc">
            <div className="header-pmc-item">
              <span className="header-pmc-label">CTL</span>
              <span className="header-pmc-value" style={{ color: "#4f6ef7" }}>{current.ctl}</span>
            </div>
            <div className="header-pmc-item">
              <span className="header-pmc-label">ATL</span>
              <span className="header-pmc-value" style={{ color: "#f97316" }}>{current.atl}</span>
            </div>
            <div className="header-pmc-item">
              <span className="header-pmc-label">TSB</span>
              <span className={`header-pmc-value ${tsbClass(current.tsb)}`}>
                {current.tsb > 0 ? "+" : ""}{current.tsb}
              </span>
            </div>
          </div>
        )}
        <button className="btn-refresh" onClick={() => setShowRefresh(true)} disabled={syncing}>
          {syncing ? "Synchronisation…" : "↻ Rafraîchir"}
        </button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "tous" ? "active" : ""}`}
          onClick={() => setTab("tous")}
        >
          Tous
        </button>
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
