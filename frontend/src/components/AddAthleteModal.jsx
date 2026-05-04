import { useState } from "react";

export default function AddAthleteModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    name: "",
    intervals_athlete_id: "",
    intervals_api_key: "",
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ajouter un athlète</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Nom
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="Ex: Thomas Dupont"
            />
          </label>
          <label>
            Athlete ID intervals.icu
            <input
              name="intervals_athlete_id"
              value={form.intervals_athlete_id}
              onChange={handleChange}
              required
              placeholder="Ex: i12345"
            />
          </label>
          <label>
            Clé API intervals.icu
            <input
              name="intervals_api_key"
              type="password"
              value={form.intervals_api_key}
              onChange={handleChange}
              required
              placeholder="Trouvée dans Paramètres > API"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
