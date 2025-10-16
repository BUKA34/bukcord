import React from "react";

/*
 props:
  - users: [{id, username}]
  - myId: socket.id
  - onVolumeChange(id, value)
  - speakingMap: { id: boolean }
  - onToggleMonitor(id)  // optional: toggle self-monitor for remote? not used
*/

export default function UserPanel({ users = [], myId, onVolumeChange, speakingMap = {}, onToggleMonitor }) {
  return (
    <div className="user-panel">
      <h4>Katılanlar</h4>
      <ul>
        {users.map(u => (
          <li key={u.id} className={u.id === myId ? "me" : ""}>
            <div className="urow">
              <span className="uname">{u.username}</span>
              <div className={`speaking-ind ${speakingMap[u.id] ? "on" : ""}`} title={speakingMap[u.id] ? "Konuşuyor" : ""}/>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                defaultValue="1"
                onChange={(e) => onVolumeChange(u.id, parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
