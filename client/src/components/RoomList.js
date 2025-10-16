import React from "react";

export default function RoomList({ rooms, currentRoom, usersByRoom, onSelect }) {
  return (
    <aside className="room-list">
      <h3>ODALAR</h3>
      <ul>
        {rooms.map((r) => (
          <li key={r} className={r === currentRoom ? "active" : ""} onClick={() => onSelect(r)}>
            <div className="room-title">{r}</div>
            <div className="room-users">
              {(usersByRoom[r] || []).slice(0, 6).map(u => (
                <div key={u.id} className="room-user-dot">
                  <span className="dot" data-speaking="false" id={`dot-${u.id}`}></span>
                </div>
              ))}
            </div>
            <div className="room-usernames">
              {(usersByRoom[r] || []).map(u => (
                <div key={u.id} className="room-username">{u.username}</div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
