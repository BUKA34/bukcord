import React from "react";

export default function UserPanel({ users, onVolumeChange, myId }) {
  return (
    <div className="user-panel">
      <h4>Katılanlar</h4>
      <ul>
        {users.map(u => (
          <li key={u.id} className={u.id === myId ? "me" : ""}>
            <div className="urow">
              <span className="uname">{u.username}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                defaultValue="1"
                onChange={(e) => onVolumeChange(u.id, parseFloat(e.target.value))}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
