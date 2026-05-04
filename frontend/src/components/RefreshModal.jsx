import { useState } from "react";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function RefreshModal({ onConfirm, onClose }) {
  const [oldest, setOldest] = useState(offsetDate(-6));
  const [newest, setNewest] = useState(todayStr());
  const [error, setError] = useState(null);

  function handleConfirm() {
    if (oldest > newest) {
      setError("La date de début doit être avant la date de fin.");
      return;
    }
    onConfirm(oldest, newest);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Rafraîchir les données</h2>
        <p className="refresh-hint">
          Sélectionne la période à recharger depuis intervals.icu.
        </p>
        <div className="refresh-fields">
          <label>
            Du
            <input
              type="date"
              value={oldest}
              max={newest}
              onChange={(e) => setOldest(e.target.value)}
            />
          </label>
          <label>
            Au
            <input
              type="date"
              value={newest}
              min={oldest}
              max={todayStr()}
              onChange={(e) => setNewest(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Annuler</button>
          <button type="button" className="btn-primary" onClick={handleConfirm}>
            Rafraîchir
          </button>
        </div>
      </div>
    </div>
  );
}
