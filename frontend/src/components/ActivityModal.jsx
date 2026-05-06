import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, ReferenceArea,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { api } from "../api";


function bestUnlimited(stream, D) {
  const n = stream.length;
  if (n < D) return null;
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => (stream[b] ?? 0) - (stream[a] ?? 0));
  const topIdx = order.slice(0, D).sort((a, b) => a - b);
  const avg = topIdx.reduce((s, i) => s + (stream[i] ?? 0), 0) / D;
  const ranges = [];
  let rStart = -1, prev = -2;
  for (const i of topIdx) {
    if (i !== prev + 1) { if (rStart >= 0) ranges.push({ start: rStart, end: prev }); rStart = i; }
    prev = i;
  }
  if (rStart >= 0) ranges.push({ start: rStart, end: prev });
  return { avg, blocs: ranges.length, ranges };
}

// DP : K fenêtres non-chevauchantes de taille w = floor(D/K) maximisant la somme totale
function bestKBlocs(stream, D, maxK) {
  const n = stream.length;
  if (n < D || D < 1 || maxK < 1) return null;

  const K = maxK;
  const w = Math.floor(D / K);
  if (w < 1 || n < K * w) return null;

  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + (stream[i] ?? 0);
  const winSum = (end) => prefix[end + 1] - prefix[end - w + 1];

  const NEG_INF = -1e18;
  const dp = [new Float64Array(n).fill(0)];
  const ch = [null];

  for (let k = 1; k <= K; k++) {
    const dpK = new Float64Array(n).fill(NEG_INF);
    const chK = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const carry = i > 0 ? dpK[i - 1] : NEG_INF;

      let useWindow = NEG_INF;
      if (i >= w - 1) {
        const prevI = i - w;
        const prevVal = prevI >= 0 ? dp[k - 1][prevI] : (k === 1 ? 0 : NEG_INF);
        if (prevVal > NEG_INF / 2) useWindow = prevVal + winSum(i);
      }

      if (useWindow >= carry) {
        dpK[i] = useWindow;
        chK[i] = 1;
      } else {
        dpK[i] = carry;
      }
    }

    dp.push(dpK);
    ch.push(chK);
  }

  if (dp[K][n - 1] <= NEG_INF / 2) return null;

  const ranges = [];
  let i = n - 1;
  for (let k = K; k >= 1; k--) {
    while (i >= 0 && ch[k][i] === 0) i--;
    if (i < 0) return null;
    ranges.push({ start: i - w + 1, end: i });
    i -= w;
  }

  ranges.reverse();
  return { avg: dp[K][n - 1] / (K * w), blocs: K, ranges, windowSecs: w };
}

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

function fmtTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

const STREAM_METRICS = {
  ride: [
    { key: "watts",     label: "Puissance", unit: "W",      color: "#7c8cff", yAxis: "left" },
    { key: "heartrate", label: "FC",        unit: "bpm",    color: "#f97316", yAxis: "right" },
    { key: "cadence",   label: "Cadence",   unit: "rpm",    color: "#22d3ee", yAxis: "right" },
    { key: "altitude",  label: "Altitude",  unit: "m",      color: "#86efac", yAxis: "left" },
  ],
  run: [
    { key: "velocity_smooth", label: "Allure",   unit: "min/km", color: "#7c8cff", yAxis: "left",
      transform: v => (v && v > 0) ? parseFloat((1000 / 60 / v).toFixed(2)) : null },
    { key: "heartrate",       label: "FC",       unit: "bpm",    color: "#f97316", yAxis: "right" },
    { key: "cadence",         label: "Cadence",  unit: "spm",    color: "#22d3ee", yAxis: "right" },
    { key: "altitude",        label: "Altitude", unit: "m",      color: "#86efac", yAxis: "left" },
  ],
};

function buildChartData(streams, activeConfigs, totalSecs) {
  const n = totalSecs || Object.values(streams).reduce((mx, arr) => Math.max(mx, arr?.length ?? 0), 0);
  const step = Math.max(1, Math.ceil(n / 300));
  const data = [];
  for (let i = 0; i < n; i += step) {
    const point = { t: i };
    for (const m of activeConfigs) {
      const arr = streams[m.key];
      if (!arr) continue;
      const raw = arr[i];
      point[m.key] = m.transform ? m.transform(raw) : (raw ?? null);
    }
    data.push(point);
  }
  return data;
}

export default function ActivityModal({ athleteId, athlete, activity, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [streams, setStreams] = useState(null);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [activeMetrics, setActiveMetrics] = useState(new Set());

  const isCycling = ["Ride", "VirtualRide"].includes(activity.type);
  const isRun = activity.type === "Run";
  const isSwim = activity.type === "Swim";
  const sportKey = isCycling ? "ride" : isRun ? "run" : null;
  const metricConfigs = sportKey ? STREAM_METRICS[sportKey] : [];

  useEffect(() => {
    api.getActivity(athleteId, activity.id)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [athleteId, activity.id]);

  useEffect(() => {
    if (!sportKey) { setStreamsLoading(false); return; }
    api.getActivityStreams(athleteId, activity.id)
      .then((data) => {
        setStreams(data);
        const available = metricConfigs.filter(m => data[m.key]?.length > 0);
        setActiveMetrics(new Set(available.slice(0, 2).map(m => m.key)));
      })
      .catch(() => setStreams(null))
      .finally(() => setStreamsLoading(false));
  }, [athleteId, activity.id, sportKey]);

  function toggleMetric(key) {
    setActiveMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const lapData = detail ? buildLapData(detail.laps, isCycling) : [];
  const hasPower = lapData.some(l => l.power != null);
  const hasPace  = lapData.some(l => l.allure != null);
  const hasSpeed = lapData.some(l => l.vitesse != null);

  const availableMetrics = streams
    ? metricConfigs.filter(m => streams[m.key]?.length > 0)
    : [];

  const activeConfigs = metricConfigs.filter(m => activeMetrics.has(m.key) && streams?.[m.key]?.length > 0);
  const totalSecs = detail?.moving_time ?? detail?.elapsed_time ?? 0;
  const chartData = activeConfigs.length > 0 && streams
    ? buildChartData(streams, activeConfigs, totalSecs)
    : [];

  const hasLeftAxis = activeConfigs.some(m => m.yAxis === "left");
  const hasRightAxis = activeConfigs.some(m => m.yAxis === "right");

  const [targetMinInput, setTargetMinInput] = useState(10);
  const [targetMin, setTargetMin] = useState(10);
  const [maxBlocs, setMaxBlocs] = useState(3); // null = illimité

  // Debounce de la durée (évite un recalcul à chaque frappe)
  useEffect(() => {
    const t = setTimeout(() => setTargetMin(targetMinInput), 300);
    return () => clearTimeout(t);
  }, [targetMinInput]);

  const effortStreamKey = isCycling ? "watts" : isRun ? "velocity_smooth" : null;

  const effortResult = useMemo(() => {
    if (!streams || !effortStreamKey) return null;
    const stream = streams[effortStreamKey];
    if (!stream?.length) return null;
    const D = Math.round(targetMin * 60);
    if (maxBlocs === null) return bestUnlimited(stream, D);
    return bestKBlocs(stream, D, maxBlocs);
  }, [streams, effortStreamKey, targetMin, maxBlocs]);

  function tooltipFormatter(value, name) {
    const m = metricConfigs.find(c => c.key === name);
    if (!m || value == null) return ["-", m?.label ?? name];
    if (m.key === "velocity_smooth") {
      const min = Math.floor(value);
      const sec = Math.round((value - min) * 60);
      return [`${min}:${String(sec).padStart(2, "0")} /km`, m.label];
    }
    return [`${Math.round(value)} ${m.unit}`, m.label];
  }

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

            {/* Meilleur effort non-consécutif — panneau interactif */}
            {effortStreamKey && (
              <div className="nonconsec-section">
                <div className="nonconsec-controls">
                  <div className="nonconsec-ctrl">
                    <label className="nonconsec-ctrl-label">Durée cible</label>
                    <div className="nonconsec-input-row">
                      <input
                        type="number" min="1" max="120"
                        value={targetMinInput}
                        onChange={e => setTargetMinInput(Math.max(1, parseInt(e.target.value) || 1))}
                        className="nonconsec-num-input"
                      />
                      <span className="nonconsec-unit">min</span>
                    </div>
                  </div>
                  <div className="nonconsec-ctrl">
                    <label className="nonconsec-ctrl-label">Max intervalles</label>
                    <div className="nonconsec-pills">
                      {[1, 2, 3, 5, 10].map(k => (
                        <button
                          key={k}
                          className={`nonconsec-pill${maxBlocs === k ? " active" : ""}`}
                          onClick={() => setMaxBlocs(k)}
                        >{k}</button>
                      ))}
                      <button
                        className={`nonconsec-pill${maxBlocs === null ? " active" : ""}`}
                        onClick={() => setMaxBlocs(null)}
                      >∞</button>
                    </div>
                  </div>
                  <div className="nonconsec-result">
                    {!streams && !streamsLoading && (
                      <span className="nonconsec-na">Streams indisponibles</span>
                    )}
                    {streamsLoading && (
                      <span className="nonconsec-na">Chargement…</span>
                    )}
                    {streams && effortResult == null && (
                      <span className="nonconsec-na">Activité trop courte</span>
                    )}
                    {effortResult != null && (
                      <>
                        <span className="nonconsec-main-value">
                          {isCycling
                            ? `${Math.round(effortResult.avg)} W`
                            : mpsToMinKm(effortResult.avg)
                              ? `${mpsToMinKm(effortResult.avg)} /km`
                              : "—"
                          }
                        </span>
                        <span className="nonconsec-detail">
                          {effortResult.blocs} bloc{effortResult.blocs > 1 ? "s" : ""}
                          {effortResult.windowSecs && effortResult.blocs > 1
                            ? ` × ${fmtTime(effortResult.windowSecs)}`
                            : ""}
                          {maxBlocs === null ? " (illimité)" : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Graphique métriques dans le temps */}
            {sportKey && (
              <div className="stream-section">
                <div className="stream-header">
                  <h3>Métriques dans le temps</h3>
                  {availableMetrics.length > 0 && (
                    <div className="stream-controls">
                      {availableMetrics.map(m => (
                        <button
                          key={m.key}
                          className={`metric-toggle${activeMetrics.has(m.key) ? " active" : ""}`}
                          style={{ "--mc": m.color }}
                          onClick={() => toggleMetric(m.key)}
                        >
                          <span className="metric-dot" style={{ background: m.color }} />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {streamsLoading && <p className="loading">Chargement des données...</p>}
                {!streamsLoading && !streams && (
                  <p className="stats-hint">Données de stream non disponibles pour cette activité.</p>
                )}
                {chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData} margin={{ top: 4, right: hasRightAxis ? 8 : 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={fmtTime}
                        tick={{ fill: "#94a3b8", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "#e2e8f0" }}
                        minTickGap={50}
                      />
                      {hasLeftAxis && (
                        <YAxis
                          yAxisId="left"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={42}
                        />
                      )}
                      {hasRightAxis && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fill: "#94a3b8", fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                          width={38}
                        />
                      )}
                      <Tooltip
                        formatter={tooltipFormatter}
                        labelFormatter={fmtTime}
                        contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12 }}
                        labelStyle={{ color: "#64748b", marginBottom: 4 }}
                      />
                      {activeConfigs.map(m => (
                        <Line
                          key={m.key}
                          yAxisId={m.yAxis}
                          dataKey={m.key}
                          stroke={m.color}
                          dot={false}
                          strokeWidth={1.5}
                          name={m.label}
                          isAnimationActive={false}
                          connectNulls
                        />
                      ))}
                      {effortResult?.ranges?.map((r, i) => (
                        <ReferenceArea
                          key={i}
                          yAxisId={hasLeftAxis ? "left" : "right"}
                          x1={r.start}
                          x2={r.end}
                          fill="#7c8cff"
                          fillOpacity={0.18}
                          stroke="#7c8cff"
                          strokeOpacity={0.5}
                          strokeWidth={1}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

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
