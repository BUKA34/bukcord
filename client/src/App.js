import React, { useEffect, useRef, useState } from "react";
import RoomList from "./components/RoomList";
import ChatArea from "./components/ChatArea";
import UserPanel from "./components/UserPanel";
import { socket } from "./socket";

const ROOMS = ["Oda 1", "Oda 2", "Oda 3", "Oda 4"];

export default function App() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState(ROOMS[0]);
  const [joined, setJoined] = useState(false);
  const [roomUsers, setRoomUsers] = useState([]); // [{id, username}]
  const myIdRef = useRef(null);
  const localStreamRef = useRef(null);

  useEffect(() => {
    socket.on("connect", () => {
      myIdRef.current = socket.id;
      console.log("socket connected", socket.id);
    });

    socket.on("room-users", (users) => {
      setRoomUsers(users || []);
    });

    socket.on("user-joined", ({ id, username }) => {
      // optional toast
    });

    socket.on("user-left", ({ id, username }) => {
      // optional toast
    });

    // signaling: incoming signals handled in separate handlers in joinRoom
    return () => {
      socket.off("connect");
      socket.off("room-users");
      socket.off("user-joined");
      socket.off("user-left");
    };
  }, []);

  const joinRoom = async () => {
    if (!username.trim()) return alert("Kullanıcı adı giriniz");
    // get audio only
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = s;
    socket.username = username;
    socket.emit("join-room", { room, username });
    setJoined(true);

    // prepare peer connections to others as they appear
    socket.on("signal", async ({ from, signal }) => {
      // create or reuse peer
      let pc = window._pcs && window._pcs[from];
      if (!window._pcs) window._pcs = {};
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        window._pcs[from] = pc;
        // add local tracks
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
        pc.ontrack = (ev) => {
          // attach audio element for incoming stream
          const elId = `audio-${from}`;
          let audio = document.getElementById(elId);
          if (!audio) {
            audio = document.createElement("audio");
            audio.id = elId;
            audio.autoplay = true;
            audio.controls = false;
            document.getElementById("audio-holder").appendChild(audio);
          }
          audio.srcObject = ev.streams[0];
        };
        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit("signal", { to: from, signal: { candidate: e.candidate } });
        };
      }

      if (signal.sdp) {
        await pc.setRemoteDescription(signal.sdp);
        if (signal.sdp.type === "offer") {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("signal", { to: from, signal: { sdp: pc.localDescription } });
        }
      } else if (signal.candidate) {
        try { await pc.addIceCandidate(signal.candidate); } catch(e) { console.warn(e); }
      }
    });

    // when someone joins (server sends room-users), create offers to them
    socket.on("room-users", (users) => {
      // create offers to users excluding self
      users.forEach(async (u) => {
        if (u.id === socket.id) return;
        if (window._pcs && window._pcs[u.id]) return;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        if (!window._pcs) window._pcs = {};
        window._pcs[u.id] = pc;
        localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

        pc.ontrack = (ev) => {
          const elId = `audio-${u.id}`;
          let audio = document.getElementById(elId);
          if (!audio) {
            audio = document.createElement("audio");
            audio.id = elId;
            audio.autoplay = true;
            audio.controls = false;
            document.getElementById("audio-holder").appendChild(audio);
          }
          audio.srcObject = ev.streams[0];
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) socket.emit("signal", { to: u.id, signal: { candidate: e.candidate } });
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", { to: u.id, signal: { sdp: pc.localDescription } });
      });
    });
  };

  const leaveRoom = () => {
    // close pcs
    if (window._pcs) {
      Object.values(window._pcs).forEach(pc => pc.close && pc.close());
      window._pcs = {};
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop && t.stop());
      localStreamRef.current = null;
    }
    socket.emit("leave-room", { room, username }); // optional server handler (not mandatory)
    setJoined(false);
    setRoomUsers([]);
    document.getElementById("audio-holder").innerHTML = "";
  };

  const changeVolume = (id, v) => {
    const audio = document.getElementById(`audio-${id}`);
    if (audio) audio.volume = v;
  };

  return (
    <div className="app">
      <div className="sidebar">
        <RoomList rooms={ROOMS} currentRoom={room} onSelect={(r) => setRoom(r)} />
        <div className="mebox">
          <input placeholder="Kullanıcı adın" value={username} onChange={e => setUsername(e.target.value)} />
          {!joined ? (
            <button onClick={joinRoom}>Katıl</button>
          ) : (
            <button onClick={leaveRoom}>Ayrıl</button>
          )}
        </div>
      </div>

      <div className="main">
        <ChatArea room={room} />
      </div>

      <div className="right">
        <UserPanel users={roomUsers} onVolumeChange={changeVolume} myId={socket.id} />
        <div id="audio-holder" style={{ display: "none" }} /> {/* audio elements are appended here */}
      </div>
    </div>
  );
}
