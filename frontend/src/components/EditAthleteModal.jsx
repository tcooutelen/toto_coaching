import { useState } from "react";

export default function EditAthleteModal({ athlete, onSave, onClose }) {
  const [form, setForm] = useState({
    name: athlete.name,
    intervals_athlete_id: athlete.intervals_athlete_id,
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
      await onSave(athlete.id, form);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Modifier l'athlète</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Nom
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Athlete ID intervals.icu
            <input
              name="intervals_athlete_id"
              value={form.intervals_athlete_id}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Nouvelle clé API (laisser vide pour ne pas changer)
            <input
              name="intervals_api_key"
              type="password"
              value={form.intervals_api_key}
              onChange={handleChange}
              placeholder="••••••••"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" disabled={loading}>
              {loading ? "Enregistrement..." : "Sauvegarder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
