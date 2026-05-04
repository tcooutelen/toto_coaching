export default function AthleteList({ athletes, selected, onSelect, onEdit, onDelete }) {
  if (athletes.length === 0) {
    return <p className="no-athletes">Aucun athlète. Clique sur + Athlète.</p>;
  }

  return (
    <ul className="athlete-list">
      {athletes.map((a) => (
        <li
          key={a.id}
          className={`athlete-item ${selected?.id === a.id ? "active" : ""}`}
          onClick={() => onSelect(a)}
        >
          <span className="athlete-name">{a.name}</span>
          <div className="athlete-actions">
            <button
              className="btn-icon"
              title="Modifier"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(a);
              }}
            >
              ✎
            </button>
            <button
              className="btn-icon btn-icon-delete"
              title="Supprimer"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Supprimer ${a.name} ?`)) onDelete(a.id);
              }}
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
