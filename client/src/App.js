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
  const [roomUsers, setRoomUsers] = useState([]); // users in current room
  const [usersByRoom, setUsersByRoom] = useState({}); // { room: [ {id, username} ] }
  const myIdRef = useRef(null);
  const localStreamRef = useRef(null);
  const pcsRef = useRef({}); // pc per remote id
  const speakingRef = useRef({}); // analysers
  const [speakingMap, setSpeakingMap] = useState({}); // for UI indicators

  // connect socket listeners
  useEffect(() => {
    socket.on("connect", () => {
      myIdRef.current = socket.id;
      console.log("connected", socket.id);
    });

    socket.on("room-users", (users) => {
      // update users for current room
      setRoomUsers(users || []);
      setUsersByRoom(prev => ({ ...prev, [room]: users || [] }));
    });

    socket.on("user-joined", ({ id, username }) => {
      // server emits user-joined to room
    });

    socket.on("user-left", ({ id }) => {
      // cleanup pc & audio for that user
      if (pcsRef.current[id]) {
        pcsRef.current[id].close && pcsRef.current[id].close();
        delete pcsRef.current[id];
      }
      // remove analyser if exists
      if (speakingRef.current[id]) {
        try { speakingRef.current[id].analyser.disconnect(); } catch(e){}
        delete speakingRef.current[id];
      }
      setSpeakingMap(prev => { const c = { ...prev }; delete c[id]; return c; });
      setRoomUsers(prev => prev.filter(u => u.id !== id));
      setUsersByRoom(prev => {
        const updated = { ...prev };
        updated[room] = (updated[room] || []).filter(u => u.id !== id);
        return updated;
      });
      const el = document.getElementById(`audio-${id}`);
      if (el) el.remove();
    });

    socket.on("signal", async ({ from, signal }) => {
      await handleSignal(from, signal);
    });

    return () => {
      socket.off("connect");
      socket.off("room-users");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("signal");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // create or get peer connection
  const createPeer = (remoteId) => {
    if (pcsRef.current[remoteId]) return pcsRef.current[remoteId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcsRef.current[remoteId] = pc;

    // add local audio track(s)
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      let audio = document.getElementById(`audio-${remoteId}`);
      if (!audio) {
        audio = document.createElement("audio");
        audio.id = `audio-${remoteId}`;
        audio.autoplay = true;
        audio.controls = false;
        audio.style.display = "none"; // audio elements are hidden, UI volume control available on right panel
        document.getElementById("audio-holder").appendChild(audio);
      }
      audio.srcObject = stream;

      // create analyser to detect speaking
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        speakingRef.current[remoteId] = { analyser, dataArray, audioCtx };
        // start polling
        const tick = () => {
          try {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;
            const speaking = avg > 10; // threshold
            setSpeakingMap(prev => ({ ...prev, [remoteId]: speaking }));
          } catch (e) {}
          speakingRef.current[remoteId] && (speakingRef.current[remoteId].timer = setTimeout(tick, 150));
        };
        tick();
      } catch (e) {
        console.warn("analyser init failed", e);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("signal", { to: remoteId, signal: { candidate: e.candidate } });
    };

    return pc;
  };

  const handleSignal = async (from, signal) => {
    let pc = pcsRef.current[from];
    if (!pc) {
      pc = createPeer(from);
    }

    if (signal.sdp) {
      await pc.setRemoteDescription(signal.sdp);
      if (signal.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: from, signal: { sdp: pc.localDescription } });
      }
    } else if (signal.candidate) {
      try { await pc.addIceCandidate(signal.candidate); } catch (e) { console.warn(e); }
    }
  };

  const joinRoom = async () => {
    if (!username.trim()) return alert("Kullanıcı adı giriniz");
    // save username locally
    localStorage.setItem("bukcord_name", username);

    // get audio only
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = s;

    // join
    socket.emit("join-room", { room, username });
    setJoined(true);

    // when server emits room-users, create offers to them; server does emit after join
    socket.once("room-users", (users) => {
      users.forEach(async (u) => {
        if (u.id === socket.id) return;
        if (pcsRef.current[u.id]) return;
        const pc = createPeer(u.id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("signal", { to: u.id, signal: { sdp: pc.localDescription } });
      });
    });
  };

  const leaveRoom = () => {
    // stop analysers & timers
    Object.values(speakingRef.current).forEach(s => {
      try { s.analyser.disconnect(); } catch(e) {}
      clearTimeout(s.timer);
    });
    speakingRef.current = {};
    setSpeakingMap({});

    // close pcs
    Object.values(pcsRef.current).forEach(pc => pc.close && pc.close());
    pcsRef.current = {};

    // stop local media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop && t.stop());
      localStreamRef.current = null;
    }

    socket.emit("leave-room", { room, username });
    setJoined(false);
    setRoomUsers([]);
    document.getElementById("audio-holder").innerHTML = "";
  };

  const changeVolume = (id, v) => {
    const audio = document.getElementById(`audio-${id}`);
    if (audio) audio.volume = v;
  };

  // screen share: getDisplayMedia and replace video track (we have no video; instead send it as an additional track if peers accept video)
  const shareScreen = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      // add screen track to each peer as a sender (peers might ignore if not prepared; this is best-effort)
      Object.values(pcsRef.current).forEach(pc => {
        try {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else {
            // if no sender, try to add track (this may create additional track)
            pc.addTrack(screenTrack, screenStream);
          }
        } catch (e) { console.warn(e); }
      });

      // when screen shared ends, remove those tracks or restore original (we didn't have video originally)
      screenTrack.onended = () => {
        Object.values(pcsRef.current).forEach(pc => {
          try {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
            if (sender) {
              try { sender.replaceTrack(null); } catch(e) {}
            }
          } catch(e) {}
        });
      };
    } catch (e) {
      alert("Ekran paylaşımı başladılamadı: " + e.message);
    }
  };

  // build usersByRoom map on the fly
  useEffect(() => {
    setUsersByRoom(prev => ({ ...prev, [room]: roomUsers }));
  }, [roomUsers, room]);

  return (
    <div className="app">
      <div className="sidebar">
        <RoomList rooms={ROOMS} currentRoom={room} usersByRoom={usersByRoom} onSelect={r => setRoom(r)} />
        <div className="mebox">
          <input placeholder="Kullanıcı adın" value={username} onChange={e => setUsername(e.target.value)} />
          {!joined ? (
            <button onClick={joinRoom}>Katıl</button>
          ) : (
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={leaveRoom}>Ayrıl</button>
              <button onClick={shareScreen}>Ekran Paylaş</button>
            </div>
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
