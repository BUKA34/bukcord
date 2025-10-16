import React from "react";

/*
 props:
  - rooms: array of room names
  - currentRoom: selected room name
  - usersByRoom: { roomName: [ {id, username}, ... ] }
  - onSelect(room)
*/

export default function RoomList({ rooms, currentRoom, usersByRoom = {}, onSelect }) {
  return (
    <aside className="room-list">
      <h3>ODALAR</h3>
      <ul>
        {rooms.map((r) => {
          const users = usersByRoom[r] || [];
          return (
            <li key={r} className={r === currentRoom ? "active" : ""} onClick={() => onSelect(r)}>
              <div className="room-title">{r}</div>
              <div className="room-users">
                {users.slice(0, 6).map(u => (
                  <span key={u.id} className="room-user-dot">
                    <span id={`dot-${u.id}`} className="dot" />
                  </span>
                ))}
              </div>
              <div className="room-usernames">
                {users.map(u => (
                  <div key={u.id} className="room-username">{u.username}</div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
