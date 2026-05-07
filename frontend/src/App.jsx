import { useState, useEffect } from "react";
import AthleteDetail from "./components/AthleteDetail";
import AddAthleteModal from "./components/AddAthleteModal";
import EditAthleteModal from "./components/EditAthleteModal";
import ConfigPanel from "./components/ConfigPanel";
import { api } from "./api";
import "./App.css";

export default function App() {
  const [athletes, setAthletes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    api.getAthletes().then(setAthletes).catch(console.error);
  }, []);

  async function handleAdd(data) {
    const athlete = await api.createAthlete(data);
    setAthletes((prev) => [...prev, athlete]);
    setShowAdd(false);
  }

  async function handleEdit(id, data) {
    const updated = await api.updateAthlete(id, data);
    setAthletes((prev) => prev.map((a) => (a.id === id ? updated : a)));
    if (selected?.id === id) setSelected(updated);
    setEditing(null);
  }

  async function handleDelete(id) {
    if (!confirm(`Supprimer ${athletes.find(a => a.id === id)?.name} ?`)) return;
    await api.deleteAthlete(id);
    setAthletes((prev) => prev.filter((a) => a.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function handleSelect(e) {
    const id = parseInt(e.target.value);
    setSelected(athletes.find((a) => a.id === id) ?? null);
  }

  return (
    <div className="app">
      <aside className="left-panel">
        <div className="panel-title">
          TotoCoaching
          <button className="btn-config" title="Configuration" onClick={() => setShowConfig(true)}>⚙</button>
        </div>

        <div className="athlete-selector">
          <select value={selected?.id ?? ""} onChange={handleSelect}>
            <option value="">— Sélectionner un athlète —</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button className="btn-add-icon" title="Ajouter un athlète" onClick={() => setShowAdd(true)}>
            +
          </button>
        </div>

        {selected && (
          <div className="athlete-card">
            <div className="athlete-card-name">{selected.name}</div>
            <div className="athlete-card-row">
              <span className="info-label">ID intervals.icu</span>
              <span className="info-value">{selected.intervals_athlete_id}</span>
            </div>
            {selected.season_start && (
              <div className="athlete-card-row">
                <span className="info-label">Début de saison</span>
                <span className="info-value">{selected.season_start}</span>
              </div>
            )}
            <div className="athlete-card-actions">
              <button className="btn-card-edit" onClick={() => setEditing(selected)}>✎ Modifier</button>
              <button className="btn-card-delete" onClick={() => handleDelete(selected.id)}>✕ Supprimer</button>
            </div>
          </div>
        )}

        {athletes.length === 0 && (
          <p className="no-athletes">Aucun athlète. Clique sur + pour en ajouter.</p>
        )}
      </aside>

      <main className="main">
        {selected ? (
          <AthleteDetail athlete={selected} />
        ) : (
          <div className="empty">
            <p>Sélectionne un athlète pour voir son tableau de bord.</p>
          </div>
        )}
      </main>

      {showAdd && (
        <AddAthleteModal onSave={handleAdd} onClose={() => setShowAdd(false)} />
      )}
      {editing && (
        <EditAthleteModal
          athlete={editing}
          onSave={handleEdit}
          onClose={() => setEditing(null)}
        />
      )}
      {showConfig && (
        <ConfigPanel onClose={() => setShowConfig(false)} />
      )}
    </div>
  );
}
