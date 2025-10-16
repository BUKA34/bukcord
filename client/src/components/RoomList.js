import React from "react";

export default function RoomList({ rooms, currentRoom, onSelect }) {
  return (
    <aside className="room-list">
      <h3>Odalar</h3>
      <ul>
        {rooms.map(r => (
          <li key={r} className={r === currentRoom ? "active" : ""} onClick={() => onSelect(r)}>
            {r}
          </li>
        ))}
      </ul>
    </aside>
  );
}
