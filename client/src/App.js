import React, { useEffect, useRef, useState } from "react";
import RoomList from "./components/RoomList";
import ChatArea from "./components/ChatArea";
import UserPanel from "./components/UserPanel";
import { socket } from "./socket";

const ROOMS = ["Oda 1", "Oda 2", "Oda 3", "Oda 4"];

export default function App() {
  const [username, setUsername] = useState(localStorage.getItem("bukcord_name") || "");
  const [room, setRoom] = useState(ROOMS[0]);
  const [joined, setJoined] = useState(false);
  const [roomUsers, setRoomUsers] = useState([]);
  const [usersByRoom, setUsersByRoom] = useState({});
  const [speakingMap, setSpeakingMap] = useState({});

  useEffect(() => {
    socket.on("connect", () => {
      console.log("connected", socket.id);
    });

    // room-users event pertains to the room the socket server emitted to (current room for us)
    socket.on("room-users", (users) => {
      // update current room users list
      setRoomUsers(users || []);
      setUsersByRoom(prev => ({ ...prev, [room]: users || [] }));
    });

    socket.on("user-joined", ({ id, username }) => {
      // play join sound if needed or show toast (we'll add sound later)
    });

    socket.on("user-left", ({ id }) => {
      // remove from lists
      setRoomUsers(prev => prev.filter(u => u.id !== id));
      setUsersByRoom(prev => {
        const copy = { ...prev };
        copy[room] = (copy[room] || []).filter(u => u.id !== id);
        return copy;
      });
    });

    return () => {
      socket.off("connect");
      socket.off("room-users");
      socket.off("user-joined");
      socket.off("user-left");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // join the currently selected room with username
  const joinRoom = () => {
    if (!username.trim()) return alert("Lütfen kullanıcı adı girin.");
    localStorage.setItem("bukcord_name", username);
    setJoined(true);
    socket.emit("join-room", { room, username });
  };

  const leaveRoom = () => {
    socket.emit("leave-room", { room, username });
    setJoined(false);
    setRoomUsers([]);
  };

  // when user clicks on a different room in left panel:
  const selectRoom = (r) => {
    // if joined, leave previous and join new instantly
    if (joined) {
      socket.emit("leave-room", { room, username });
      // small delay to ensure server updates; then join new
      setTimeout(() => {
        setRoom(r);
        socket.emit("join-room", { room: r, username });
        setJoined(true);
      }, 150);
    } else {
      setRoom(r);
    }
  };

  // per-user volume change (client-side only)
  const changeVolume = (id, volume) => {
    const audio = document.getElementById(`audio-${id}`);
    if (audio) audio.volume = volume;
    // keep map if you want to reflect in UI
  };

  return (
    <div className="app">
      <div className="sidebar">
        <RoomList rooms={ROOMS} currentRoom={room} usersByRoom={usersByRoom} onSelect={selectRoom} />
        <div className="mebox">
          <input
            placeholder="Kullanıcı adın"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {!joined ? (
            <button onClick={joinRoom}>Katıl</button>
          ) : (
            <button onClick={leaveRoom}>Ayrıl</button>
          )}
        </div>
      </div>

      <div className="main">
        <ChatArea room={room} myName={username} />
      </div>

      <div className="right">
        <UserPanel users={roomUsers} myId={socket.id} onVolumeChange={changeVolume} speakingMap={speakingMap} />
        <div id="audio-holder" style={{ display: "none" }} />
      </div>
    </div>
  );
}
