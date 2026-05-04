import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { api } from "../api";

const TYPE_LABELS = {
  Ride: "Vélo", Run: "Course", Swim: "Natation",
  VirtualRide: "Vélo (virtuel)", Walk: "Marche",
};

function mpsToKmh(mps) {
  return mps != null ? (mps * 3.6).toFixed(1) : null;
}

function mpsToMinKm(mps) {
  if (!mps || mps <= 0) return null;
  const minPerKm = 1000 / 60 / mps;
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDuration(seconds) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m${String(s).padStart(2, "0")}s`;
}

function StatBox({ label, value }) {
  return (
    <div className="stat-box">
      <span className="stat-value">{value ?? "-"}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function buildLapData(laps, isCycling) {
  if (!laps?.length) return [];
  return laps.map((lap, i) => {
    const row = { name: `L${i + 1}` };
    if (isCycling) {
      row.power = lap.average_watts ?? lap.avg_power ?? null;
      row.vitesse = lap.average_speed != null ? parseFloat(mpsToKmh(lap.average_speed)) : null;
    } else {
      row.allure = lap.average_speed > 0
        ? parseFloat((1000 / 60 / lap.average_speed).toFixed(2))
        : null;
    }
    row.fc = lap.average_heartrate ?? null;
    return row;
  });
}

export default function ActivityModal({ athleteId, activity, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isCycling = ["Ride", "VirtualRide"].includes(activity.type);
  const isSwim = activity.type === "Swim";

  useEffect(() => {
    api.getActivity(athleteId, activity.id)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [athleteId, activity.id]);

  const lapData = detail ? buildLapData(detail.laps, isCycling) : [];
  const hasPower = lapData.some((l) => l.power != null);
  const hasPace  = lapData.some((l) => l.allure != null);
  const hasSpeed = lapData.some((l) => l.vitesse != null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="activity-badge">{TYPE_LABELS[activity.type] ?? activity.type}</span>
            <h2>{activity.name}</h2>
            <p className="activity-date">{activity.start_date_local?.slice(0, 10)}</p>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {loading && <p className="loading">Chargement...</p>}
        {error && <p className="error">Erreur : {error}</p>}

        {detail && (
          <>
            {/* Stats résumé */}
            <div className="stat-grid">
              <StatBox label="Distance" value={detail.distance ? (detail.distance / 1000).toFixed(2) + " km" : null} />
              <StatBox label="Durée" value={formatDuration(detail.moving_time ?? detail.elapsed_time)} />
              <StatBox label="TSS" value={detail.icu_training_load ?? detail.tss} />
              {isCycling && (
                <>
                  <StatBox label="Puissance moy." value={(detail.icu_average_watts ?? detail.average_watts) ? (detail.icu_average_watts ?? detail.average_watts) + " W" : null} />
                  <StatBox label="Puissance norm." value={(detail.icu_weighted_avg_watts ?? detail.normalized_power) ? (detail.icu_weighted_avg_watts ?? detail.normalized_power) + " W" : null} />
                  <StatBox label="IF" value={(detail.icu_intensity ?? detail.intensity_factor) ? (detail.icu_intensity ?? detail.intensity_factor).toFixed(2) : null} />
                  <StatBox label="Vitesse moy." value={mpsToKmh(detail.average_speed) ? mpsToKmh(detail.average_speed) + " km/h" : null} />
                </>
              )}
              {!isCycling && !isSwim && (
                <>
                  <StatBox label="Allure moy." value={mpsToMinKm(detail.average_speed) ? mpsToMinKm(detail.average_speed) + " /km" : null} />
                  <StatBox label="Allure best" value={mpsToMinKm(detail.max_speed) ? mpsToMinKm(detail.max_speed) + " /km" : null} />
                </>
              )}
              <StatBox label="FC moy." value={detail.average_heartrate ? Math.round(detail.average_heartrate) + " bpm" : null} />
              <StatBox label="FC max" value={detail.max_heartrate ? Math.round(detail.max_heartrate) + " bpm" : null} />
              {isCycling && <StatBox label="Dénivelé" value={detail.total_elevation_gain ? detail.total_elevation_gain + " m" : null} />}
            </div>

            {/* Chart laps */}
            {lapData.length > 1 && (
              <div className="lap-chart">
                <h3>Analyse par lap</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={lapData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#1a1d27", border: "1px solid #2d3148", borderRadius: 6 }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {hasPower && <Bar yAxisId="left" dataKey="power" name="Puissance (W)" fill="#7c8cff" radius={[3,3,0,0]} />}
                    {hasSpeed && <Bar yAxisId="left" dataKey="vitesse" name="Vitesse (km/h)" fill="#7c8cff" radius={[3,3,0,0]} />}
                    {hasPace  && <Bar yAxisId="left" dataKey="allure" name="Allure (min/km)" fill="#7c8cff" radius={[3,3,0,0]} />}
                    {lapData.some(l => l.fc) && <Bar yAxisId="right" dataKey="fc" name="FC (bpm)" fill="#f97316" radius={[3,3,0,0]} />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Table laps */}
            {lapData.length > 0 && (
              <div className="lap-table-wrap">
                <table className="activity-table">
                  <thead>
                    <tr>
                      <th>Lap</th>
                      {isCycling  && <th>Puissance (W)</th>}
                      {isCycling  && <th>Vitesse (km/h)</th>}
                      {!isCycling && !isSwim && <th>Allure (/km)</th>}
                      <th>FC (bpm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lapData.map((l) => (
                      <tr key={l.name}>
                        <td>{l.name}</td>
                        {isCycling  && <td>{l.power ?? "-"}</td>}
                        {isCycling  && <td>{l.vitesse ?? "-"}</td>}
                        {!isCycling && !isSwim && (
                          <td>{l.allure != null ? `${Math.floor(l.allure)}:${String(Math.round((l.allure % 1) * 60)).padStart(2, "0")}` : "-"}</td>
                        )}
                        <td>{l.fc != null ? Math.round(l.fc) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
