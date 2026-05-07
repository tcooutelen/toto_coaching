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

// DP segments 30s : sélectionne S = round(D/30) segments consécutifs formant au plus K blocs
function bestKBlocs(stream, D, maxK) {
  const SEG = 30;
  const n = stream.length;
  const S = Math.round(D / SEG);
  if (S < 1 || maxK < 1) return null;

  const nSegs = Math.floor(n / SEG);
  if (nSegs < S) return null;

  const seg = new Float64Array(nSegs);
  for (let i = 0; i < nSegs; i++) {
    let sum = 0;
    for (let j = i * SEG; j < (i + 1) * SEG; j++) sum += stream[j] ?? 0;
    seg[i] = sum / SEG;
  }

  const K = maxK;
  const NEG_INF = -1e18;
  const W = (K + 1) * 2;
  const si = (j, k, b) => j * W + k * 2 + b;
  const sz = (S + 1) * W;

  const dpArr = [];
  const choiceArr = [null];
  const d0 = new Float64Array(sz).fill(NEG_INF);
  d0[si(0, 0, 0)] = 0;
  dpArr.push(d0);

  for (let i = 0; i < nSegs; i++) {
    const cur = dpArr[i];
    const nxt = new Float64Array(sz).fill(NEG_INF);
    const cho = new Uint8Array(sz);   // 0=skip, 1=continue, 2=new_bloc
    const prv = new Uint8Array(sz);   // previous b when skip

    for (let j = 0; j <= Math.min(i, S); j++) {
      for (let k = 0; k <= Math.min(i, K); k++) {
        for (let b = 0; b <= 1; b++) {
          const v = cur[si(j, k, b)];
          if (v <= NEG_INF / 2) continue;

          // Skip segment i
          const ns0 = si(j, k, 0);
          if (v > nxt[ns0]) { nxt[ns0] = v; cho[ns0] = 0; prv[ns0] = b; }

          // Select segment i
          if (j < S) {
            if (b === 1) {
              const ns1 = si(j + 1, k, 1);
              const nv = v + seg[i];
              if (nv > nxt[ns1]) { nxt[ns1] = nv; cho[ns1] = 1; }
            } else if (k < K) {
              const ns2 = si(j + 1, k + 1, 1);
              const nv = v + seg[i];
              if (nv > nxt[ns2]) { nxt[ns2] = nv; cho[ns2] = 2; }
            }
          }
        }
      }
    }
    dpArr.push(nxt);
    choiceArr.push({ cho, prv });
  }

  const last = dpArr[nSegs];
  let bestVal = NEG_INF, bestK = -1, bestB = -1;
  for (let k = 1; k <= K; k++) {
    for (let b = 0; b <= 1; b++) {
      const v = last[si(S, k, b)];
      if (v > bestVal) { bestVal = v; bestK = k; bestB = b; }
    }
  }
  if (bestVal <= NEG_INF / 2) return null;

  // Reconstruction
  const selected = new Uint8Array(nSegs);
  let j = S, k = bestK, b = bestB;
  for (let i = nSegs; i >= 1; i--) {
    const { cho, prv } = choiceArr[i];
    const idx = si(j, k, b);
    const act = cho[idx];
    if (act === 0) {
      selected[i - 1] = 0;
      b = prv[idx];
    } else if (act === 1) {
      selected[i - 1] = 1;
      j--;
    } else {
      selected[i - 1] = 1;
      j--; k--;
      b = 0;
    }
  }

  const ranges = [];
  let rStart = -1;
  for (let i = 0; i < nSegs; i++) {
    if (selected[i] === 1 && (i === 0 || selected[i - 1] === 0)) rStart = i * SEG;
    if (selected[i] === 1 && (i === nSegs - 1 || selected[i + 1] === 0))
      ranges.push({ start: rStart, end: (i + 1) * SEG - 1 });
  }

  return { avg: bestVal / S, blocs: ranges.length, ranges, windowSecs: null };
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

const EFFORT_METRIC_DEFS = [
  { key: "watts",           label: "Puissance", fmt: v => `${Math.round(v)} W` },
  { key: "velocity_smooth", label: "Allure",    fmt: v => mpsToMinKm(v) ? `${mpsToMinKm(v)} /km` : "—" },
  { key: "heartrate",       label: "FC",        fmt: v => `${Math.round(v)} bpm` },
];

const STREAM_METRICS = {
  ride: [
    { key: "watts",     label: "Puissance", unit: "W",      color: "#7c8cff", yAxis: "left" },
    { key: "heartrate", label: "FC",        unit: "bpm",    color: "#f97316", yAxis: "right" },
    { key: "cadence",   label: "Cadence",   unit: "rpm",    color: "#22d3ee", yAxis: "right" },
    { key: "altitude",  label: "Altitude",  unit: "m",      color: "#86efac", yAxis: "left" },
  ],
  run: [
    { key: "velocity_smooth", label: "Allure",    unit: "min/km", color: "#7c8cff", yAxis: "left",
      transform: v => (v && v > 0) ? parseFloat((1000 / 60 / v).toFixed(2)) : null },
    { key: "watts",           label: "Puissance", unit: "W",      color: "#a78bfa", yAxis: "left" },
    { key: "heartrate",       label: "FC",        unit: "bpm",    color: "#f97316", yAxis: "right" },
    { key: "cadence",         label: "Cadence",   unit: "spm",    color: "#22d3ee", yAxis: "right" },
    { key: "altitude",        label: "Altitude",  unit: "m",      color: "#86efac", yAxis: "left" },
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
  const [config, setConfig] = useState(null);
  const [effortStreamKey, setEffortStreamKey] = useState(null);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => null);
  }, []);

  // Debounce de la durée (évite un recalcul à chaque frappe)
  useEffect(() => {
    const t = setTimeout(() => setTargetMin(targetMinInput), 300);
    return () => clearTimeout(t);
  }, [targetMinInput]);

  function applyPreset(dur, blocs) {
    setTargetMinInput(dur);
    setTargetMin(dur);
    setMaxBlocs(blocs);
  }

  // Initialise la métrique d'effort dès que les streams sont disponibles
  useEffect(() => {
    if (!streams || !sportKey) return;
    const defaultKey = isCycling ? "watts" : "velocity_smooth";
    const firstAvailable = EFFORT_METRIC_DEFS.find(m => streams[m.key]?.length > 0);
    setEffortStreamKey(prev =>
      prev && streams[prev]?.length > 0 ? prev
      : streams[defaultKey]?.length > 0 ? defaultKey
      : firstAvailable?.key ?? null
    );
  }, [streams, sportKey]);

  const availableEffortMetrics = streams
    ? EFFORT_METRIC_DEFS.filter(m => streams[m.key]?.length > 0)
    : [];

  const allPresets = useMemo(() => {
    if (!config?.performance) return [];
    return config.performance
      .filter(p => p.duration_min <= totalSecs / 60)
      .flatMap(({ duration_min, blocs, max_blocs }) => {
        const list = blocs?.length ? blocs : max_blocs ? [max_blocs] : [];
        return list.map(b => ({ duration_min, blocs: b }));
      });
  }, [config, totalSecs]);

  const zoneResults = useMemo(() => {
    if (!streams || !allPresets.length) return {};
    const out = {};
    for (const def of EFFORT_METRIC_DEFS) {
      const stream = streams[def.key];
      if (!stream?.length) continue;
      out[def.key] = {};
      for (const { duration_min, blocs } of allPresets) {
        const D = Math.round(duration_min * 60);
        out[def.key][`${duration_min}_${blocs}`] = bestKBlocs(stream, D, blocs);
      }
    }
    return out;
  }, [streams, allPresets]);

  const effortResult = useMemo(() => {
    if (!streams || !effortStreamKey) return null;
    const stream = streams[effortStreamKey];
    if (!stream?.length) return null;
    const D = Math.round(targetMin * 60);
    if (maxBlocs === null) return bestUnlimited(stream, D);
    return bestKBlocs(stream, D, maxBlocs);
  }, [streams, effortStreamKey, targetMin, maxBlocs]);

  const blocStats = useMemo(() => {
    if (!effortResult?.ranges?.length || !streams?.[effortStreamKey]) return null;
    const stream = streams[effortStreamKey];
    return effortResult.ranges.map(({ start, end }) => {
      const slice = [];
      for (let i = start; i <= end && i < stream.length; i++) {
        const v = stream[i];
        if (v != null && v > 0) slice.push(v);
      }
      if (!slice.length) return null;
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
      const max = slice.reduce((a, v) => Math.max(a, v), -Infinity);
      const min = slice.reduce((a, v) => Math.min(a, v), Infinity);
      return { start, end, dur: end - start + 1, avg, max, min };
    }).filter(Boolean);
  }, [effortResult, streams, effortStreamKey]);

  const selectedEffortDef = EFFORT_METRIC_DEFS.find(m => m.key === effortStreamKey);
  const fmtMetric = selectedEffortDef ? selectedEffortDef.fmt : v => `${Math.round(v)}`;

  function tooltipFormatter(value, name) {
    const m = metricConfigs.find(c => c.label === name);
    if (!m || value == null) return ["-", name];
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
                {/* 1. Sélecteur de métrique */}
                {availableEffortMetrics.length > 1 && (
                  <div className="nonconsec-metric-row">
                    <span className="nonconsec-presets-label">Métrique</span>
                    <div className="nonconsec-pills">
                      {availableEffortMetrics.map(m => (
                        <button
                          key={m.key}
                          className={`nonconsec-pill${effortStreamKey === m.key ? " active" : ""}`}
                          onClick={() => setEffortStreamKey(m.key)}
                        >{m.label}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. Préréglages depuis la config admin */}
                {config?.performance?.filter(p => p.duration_min <= totalSecs / 60).length > 0 && (
                  <div className="nonconsec-presets">
                    <span className="nonconsec-presets-label">Préréglages</span>
                    <div className="nonconsec-presets-grid">
                      {config.performance
                        .filter(p => p.duration_min <= totalSecs / 60)
                        .map(({ duration_min, blocs }) => (
                          <div key={duration_min} className="nonconsec-presets-row">
                            <span className="nonconsec-preset-dur">{duration_min} min</span>
                            <div className="nonconsec-presets-pills">
                              {(blocs ?? []).map(b => (
                                <button
                                  key={b}
                                  className={`nonconsec-preset-pill${targetMin === duration_min && maxBlocs === b ? " active" : ""}`}
                                  onClick={() => applyPreset(duration_min, b)}
                                >
                                  {b} bloc{b > 1 ? "s" : ""}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                )}

                <div className="nonconsec-controls">
                  <div className="nonconsec-ctrl">
                    <label className="nonconsec-ctrl-label">Durée</label>
                    <div className="nonconsec-input-row">
                      <input
                        type="number" min="1" max="240"
                        value={targetMinInput}
                        onChange={e => setTargetMinInput(Math.max(1, parseInt(e.target.value) || 1))}
                        className="nonconsec-num-input"
                      />
                      <span className="nonconsec-unit">min</span>
                    </div>
                  </div>
                  <div className="nonconsec-ctrl">
                    <label className="nonconsec-ctrl-label">Blocs</label>
                    <div className="nonconsec-blocs-row">
                      <input
                        type="number" min="1"
                        value={maxBlocs ?? ""}
                        placeholder="N"
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          if (v > 0) setMaxBlocs(v);
                        }}
                        className="nonconsec-num-input"
                      />
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
                          {fmtMetric(effortResult.avg)}
                        </span>
                        <span className="nonconsec-detail">
                          {effortResult.blocs} bloc{effortResult.blocs > 1 ? "s" : ""}
                          {effortResult.blocs > 1 && effortResult.ranges && (() => {
                            const durs = effortResult.ranges.map(r => r.end - r.start + 1);
                            const allSame = durs.every(d => d === durs[0]);
                            if (allSame) return ` × ${fmtTime(durs[0])}`;
                            if (durs.length <= 4) return ` (${durs.map(fmtTime).join(", ")})`;
                            return ` (variable)`;
                          })()}
                          {maxBlocs === null ? " (illimité)" : ""}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Zones de travail */}
            {allPresets.length > 0 && streams && (
              <div className="zones-section">
                <h3 className="zones-title">Zones de travail</h3>
                <div className="zones-table-wrap">
                  <table className="zones-table">
                    <thead>
                      <tr>
                        <th></th>
                        {allPresets.map(({ duration_min, blocs }) => (
                          <th key={`${duration_min}_${blocs}`}>
                            <span className="zones-th-dur">{duration_min} min</span>
                            <span className="zones-th-blocs">× {blocs}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {availableEffortMetrics.map(def => (
                        <tr key={def.key}>
                          <td className="zones-row-label">{def.label}</td>
                          {allPresets.map(({ duration_min, blocs }) => {
                            const r = zoneResults[def.key]?.[`${duration_min}_${blocs}`];
                            return (
                              <td key={`${duration_min}_${blocs}`} className="zones-cell">
                                {r ? def.fmt(r.avg) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <ResponsiveContainer width="100%" height={320}>
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
                {blocStats?.length > 0 && (
                  <div className="bloc-table-wrap">
                    <table className="bloc-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Début</th>
                          <th>Fin</th>
                          <th>Durée</th>
                          <th>Moy.</th>
                          <th>Max</th>
                          <th>Min</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blocStats.map((b, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{fmtTime(b.start)}</td>
                            <td>{fmtTime(b.end)}</td>
                            <td>{fmtTime(b.dur)}</td>
                            <td className="bloc-td-main">{fmtMetric(b.avg)}</td>
                            <td>{fmtMetric(b.max)}</td>
                            <td>{fmtMetric(b.min)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
