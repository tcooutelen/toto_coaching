export default function AthleteList({ athletes, selected, onSelect, onDelete }) {
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
          <button
            className="btn-delete"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Supprimer ${a.name} ?`)) onDelete(a.id);
            }}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
