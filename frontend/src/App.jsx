import { useState, useEffect } from "react";
import AthleteList from "./components/AthleteList";
import AthleteDetail from "./components/AthleteDetail";
import AddAthleteModal from "./components/AddAthleteModal";
import { api } from "./api";
import "./App.css";

export default function App() {
  const [athletes, setAthletes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api.getAthletes().then(setAthletes).catch(console.error);
  }, []);

  async function handleAdd(data) {
    const athlete = await api.createAthlete(data);
    setAthletes((prev) => [...prev, athlete]);
    setShowAdd(false);
  }

  async function handleDelete(id) {
    await api.deleteAthlete(id);
    setAthletes((prev) => prev.filter((a) => a.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>TotoCoaching</h1>
          <button className="btn-add" onClick={() => setShowAdd(true)}>
            + Athlète
          </button>
        </div>
        <AthleteList
          athletes={athletes}
          selected={selected}
          onSelect={setSelected}
          onDelete={handleDelete}
        />
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
    </div>
  );
}
