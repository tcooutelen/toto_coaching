import { useState, useEffect } from "react";
import { api } from "../api";

function normalize(cfg) {
  const perf = cfg.performance ?? [];
  if (perf.length === 0) return [];
  // Migration depuis l'ancien format plat {duration_min, max_blocs}
  if (!Array.isArray(perf[0]?.blocs)) {
    const map = {};
    for (const item of perf) {
      const d = item.duration_min;
      if (!map[d]) map[d] = { duration_min: d, blocs: [] };
      if (item.max_blocs != null) map[d].blocs.push(item.max_blocs);
    }
    return Object.values(map).sort((a, b) => a.duration_min - b.duration_min);
  }
  return perf;
}

export default function ConfigPanel({ onClose }) {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingBloc, setPendingBloc] = useState({}); // {rowIdx: inputValue}
  const [newDur, setNewDur] = useState("");

  useEffect(() => {
    api.getConfig()
      .then(cfg => setItems(normalize(cfg)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function addBloc(rowIdx) {
    const val = parseInt(pendingBloc[rowIdx]);
    if (!val || val < 1) return;
    setItems(prev => prev.map((item, i) => {
      if (i !== rowIdx) return item;
      if (item.blocs.includes(val)) return item;
      return { ...item, blocs: [...item.blocs, val].sort((a, b) => a - b) };
    }));
    setPendingBloc(prev => ({ ...prev, [rowIdx]: "" }));
  }

  function removeBloc(rowIdx, bloc) {
    setItems(prev => prev.map((item, i) =>
      i === rowIdx ? { ...item, blocs: item.blocs.filter(b => b !== bloc) } : item
    ));
  }

  function removeRow(rowIdx) {
    setItems(prev => prev.filter((_, i) => i !== rowIdx));
  }

  function addDuration() {
    const d = parseInt(newDur);
    if (!d || d < 1) return;
    if (items.some(item => item.duration_min === d)) return;
    setItems(prev =>
      [...prev, { duration_min: d, blocs: [] }].sort((a, b) => a.duration_min - b.duration_min)
    );
    setNewDur("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.saveConfig({ performance: items });
      onClose();
    } catch (e) {
      alert("Erreur : " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal config-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Configuration — Performances</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <p className="config-hint">
          Pour chaque durée, définissez les nombres de blocs à analyser.
        </p>

        {loading ? <p className="loading">Chargement…</p> : (
          <>
            <table className="config-table">
              <thead>
                <tr>
                  <th>Durée</th>
                  <th>Blocs</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr><td colSpan={3} className="config-empty">Aucune durée configurée</td></tr>
                )}
                {items.map((item, rowIdx) => (
                  <tr key={item.duration_min}>
                    <td className="config-td-dur">{item.duration_min} min</td>
                    <td className="config-td-blocs">
                      <div className="config-blocs-row">
                        {item.blocs.map(b => (
                          <span key={b} className="config-bloc-pill">
                            {b}
                            <button
                              className="config-pill-del"
                              onClick={() => removeBloc(rowIdx, b)}
                            >×</button>
                          </span>
                        ))}
                        <div className="config-add-bloc">
                          <input
                            type="number" min="1" placeholder="N"
                            value={pendingBloc[rowIdx] ?? ""}
                            onChange={e => setPendingBloc(prev => ({ ...prev, [rowIdx]: e.target.value }))}
                            onKeyDown={e => e.key === "Enter" && addBloc(rowIdx)}
                          />
                          <button onClick={() => addBloc(rowIdx)}>+</button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <button className="btn-config-delete" onClick={() => removeRow(rowIdx)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="config-add-dur-row">
              <label>Ajouter une durée</label>
              <div className="config-add-dur-input">
                <input
                  type="number" min="1" max="240" placeholder="ex : 30"
                  value={newDur}
                  onChange={e => setNewDur(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addDuration()}
                />
                <span>min</span>
                <button className="btn-config-add" onClick={addDuration}>+ Ajouter</button>
              </div>
            </div>

            <div className="config-actions">
              <button className="btn-secondary" onClick={onClose}>Annuler</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
