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
  const localStreamRef = useRef(null);
  const pcsRef = useRef({}); // peer connections keyed by remoteId
  const audioElementsRef = useRef({}); // audio DOM elements keyed by remoteId
  const analysersRef = useRef({}); // analysers for speaking detection keyed by remoteId
  const joinSoundRef = useRef(null);
  const leaveSoundRef = useRef(null);
  const selfMonitorRef = useRef(null); // audio element for self-monitor
  const [selfMonitorOn, setSelfMonitorOn] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const screenTrackRef = useRef(null);

  useEffect(() => {
    // load join/leave sounds from public folder
    joinSoundRef.current = new Audio(process.env.PUBLIC_URL + "/join.mp3");
    leaveSoundRef.current = new Audio(process.env.PUBLIC_URL + "/leave.mp3");
    joinSoundRef.current.volume = 0.6;
    leaveSoundRef.current.volume = 0.6;

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
    });

    socket.on("room-users", (users) => {
      setRoomUsers(users || []);
      setUsersByRoom(prev => ({ ...prev, [room]: users || [] }));
    });

    socket.on("user-joined", ({ id, username }) => {
      // play join sound
      try { joinSoundRef.current && joinSoundRef.current.play(); } catch(e) {}
    });

    socket.on("user-left", ({ id }) => {
      try { leaveSoundRef.current && leaveSoundRef.current.play(); } catch(e) {}
      // cleanup handled in leave handling where appropriate
    });

    // signaling
    socket.on("signal", async ({ from, signal }) => {
      await handleSignal(from, signal);
    });

    // clean up on unmount
    return () => {
      socket.off("connect");
      socket.off("room-users");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("signal");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // helpers
  const ensureAudioElement = (id) => {
    if (audioElementsRef.current[id]) return audioElementsRef.current[id];
    const audio = document.createElement("audio");
    audio.id = `audio-${id}`;
    audio.autoplay = true;
    audio.playsInline = true;
    audio.controls = false;
    // start at full volume by default
    audio.volume = 1;
    // append to hidden holder
    const holder = document.getElementById("audio-holder");
    if (holder) holder.appendChild(audio);
    audioElementsRef.current[id] = audio;
    return audio;
  };

  const createAnalyserForStream = (id, stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analysersRef.current[id] = { analyser, dataArray, audioCtx, running: true };
      const tick = () => {
        try {
          const obj = analysersRef.current[id];
          if (!obj || !obj.running) return;
          obj.analyser.getByteFrequencyData(obj.dataArray);
          let sum = 0;
          for (let i = 0; i < obj.dataArray.length; i++) sum += obj.dataArray[i];
          const avg = sum / obj.dataArray.length;
          const speaking = avg > 8; // threshold tuned
          setSpeakingMap(prev => ({ ...prev, [id]: speaking }));
        } catch (e) {
          // ignore
        } finally {
          if (analysersRef.current[id] && analysersRef.current[id].running) {
            analysersRef.current[id].timer = setTimeout(tick, 150);
          }
        }
      };
      tick();
    } catch (e) {
      console.warn("Analyser creation failed:", e);
    }
  };

  const stopAnalyser = (id) => {
    const obj = analysersRef.current[id];
    if (obj) {
      obj.running = false;
      try { obj.analyser.disconnect(); } catch(e) {}
      try { obj.audioCtx.close(); } catch(e) {}
      clearTimeout(obj.timer);
      delete analysersRef.current[id];
    }
    setSpeakingMap(prev => { const c = { ...prev }; delete c[id]; return c; });
  };

  const createPeerConnection = (remoteId) => {
    if (pcsRef.current[remoteId]) return pcsRef.current[remoteId];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcsRef.current[remoteId] = pc;

    // add local audio track(s)
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try { pc.addTrack(track, localStreamRef.current); } catch(e) {}
      });
    }

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      // determine if this is screen (has video tracks) or audio-only
      const hasVideo = stream.getVideoTracks && stream.getVideoTracks().length > 0;
      if (hasVideo) {
        // create / show video element in UI (right panel or modal)
        let video = document.getElementById(`video-${remoteId}`);
        if (!video) {
          video = document.createElement("video");
          video.id = `video-${remoteId}`;
          video.autoplay = true;
          video.playsInline = true;
          video.controls = false;
          video.style.maxWidth = "100%";
          video.style.borderRadius = "8px";
          const holder = document.getElementById("screen-holder");
          if (holder) holder.appendChild(video);
        }
        video.srcObject = stream;
      } else {
        // audio stream
        const audio = ensureAudioElement(remoteId);
        audio.srcObject = stream;
        // setup analyser for speaking indicator
        createAnalyserForStream(remoteId, stream);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("signal", { to: remoteId, signal: { candidate: e.candidate } });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
        // cleanup
        try { pc.close(); } catch(e) {}
        delete pcsRef.current[remoteId];
      }
    };

    return pc;
  };

  const handleSignal = async (from, signal) => {
    let pc = pcsRef.current[from];
    if (!pc) pc = createPeerConnection(from);

    if (signal.sdp) {
      await pc.setRemoteDescription(signal.sdp);
      if (signal.sdp.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { to: from, signal: { sdp: pc.localDescription } });
      }
    } else if (signal.candidate) {
      try { await pc.addIceCandidate(signal.candidate); } catch (e) { console.warn("addIceCandidate failed", e); }
    }
  };

  // join room: ensure leaving previous rooms handled by server, but cleanup local PCs too
  const joinRoom = async () => {
    if (!username.trim()) return alert("Lütfen kullanıcı adı girin.");
    localStorage.setItem("bukcord_name", username);

    // get audio only
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = s;

      // self-monitor audio element
      if (!selfMonitorRef.current) {
        const selfAudio = document.createElement("audio");
        selfAudio.id = "audio-self";
        selfAudio.autoplay = true;
        selfAudio.muted = !selfMonitorOn; // muted default depending on toggle
        selfAudio.srcObject = s;
        document.getElementById("audio-holder").appendChild(selfAudio);
        selfMonitorRef.current = selfAudio;
      } else {
        selfMonitorRef.current.srcObject = s;
      }

      // emit join
      socket.emit("join-room", { room, username });
      setJoined(true);

      // when server returns room-users (emitted on join), create offers to them
      socket.once("room-users", (users) => {
        // create offers to users excluding self
        users.forEach(async (u) => {
          if (u.id === socket.id) return;
          if (pcsRef.current[u.id]) return;
          const pc = createPeerConnection(u.id);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("signal", { to: u.id, signal: { sdp: pc.localDescription } });
        });
      });
    } catch (e) {
      alert("Mikrofona erişilemedi: " + (e.message || e));
      console.error(e);
    }
  };

  const leaveRoom = () => {
    // stop analysers & timers
    Object.keys(analysersRef.current).forEach(id => stopAnalyser(id));

    // close all peer connections
    Object.values(pcsRef.current).forEach(pc => {
      try { pc.close(); } catch(e) {}
    });
    pcsRef.current = {};

    // stop local media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop && t.stop());
      localStreamRef.current = null;
    }

    // remove audio elements and video elements
    Object.keys(audioElementsRef.current).forEach(id => {
      const el = audioElementsRef.current[id];
      try { el.srcObject = null; el.remove(); } catch(e) {}
    });
    audioElementsRef.current = {};

    const vids = document.querySelectorAll("[id^='video-']");
    vids.forEach(v => v.remove());

    // remove self monitor
    if (selfMonitorRef.current) {
      try { selfMonitorRef.current.srcObject = null; selfMonitorRef.current.remove(); } catch(e) {}
      selfMonitorRef.current = null;
    }

    socket.emit("leave-room", { room, username });
    setJoined(false);
    setRoomUsers([]);
    setUsersByRoom(prev => ({ ...prev, [room]: [] }));
    setSpeakingMap({});
    setIsSharing(false);
    screenTrackRef.current = null;
    // clear audio-holder
    const holder = document.getElementById("audio-holder");
    if (holder) holder.innerHTML = "";
    // clear screen-holder
    const sh = document.getElementById("screen-holder");
    if (sh) sh.innerHTML = "";
  };

  // when select different room in UI
  const selectRoom = (r) => {
    if (r === room) return;
    if (joined) {
      // leave current and join new one smoothly
      leaveRoom();
      setTimeout(() => {
        setRoom(r);
        joinRoom();
      }, 250);
    } else {
      setRoom(r);
    }
  };

  const changeVolume = (id, volume) => {
    const audio = document.getElementById(`audio-${id}`);
    if (audio) audio.volume = volume;
    // store volume preferences in localStorage per id if desired
  };

  // toggle self monitor
  const toggleSelfMonitor = () => {
    setSelfMonitorOn(v => {
      const newV = !v;
      if (selfMonitorRef.current) selfMonitorRef.current.muted = !newV;
      return newV;
    });
  };

  // screen share: add screen track(s) to each peer
  const shareScreen = async () => {
    if (isSharing) {
      // stop sharing: remove screen tracks and notify peers by replacing track with null or just stop track
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      setIsSharing(false);
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = screenStream.getVideoTracks()[0];
      screenTrackRef.current = track;
      // add track to each peer
      Object.values(pcsRef.current).forEach(pc => {
        try {
          // try to find existing video sender
          const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
          if (sender) {
            sender.replaceTrack(track);
          } else {
            pc.addTrack(track, screenStream);
          }
        } catch (e) {
          console.warn("screen share addTrack failed", e);
        }
      });

      // also show local preview in screen-holder
      let localVideo = document.getElementById("video-self");
      if (!localVideo) {
        localVideo = document.createElement("video");
        localVideo.id = "video-self";
        localVideo.autoplay = true;
        localVideo.muted = true;
        localVideo.playsInline = true;
        document.getElementById("screen-holder").appendChild(localVideo);
      }
      const localStreamForPreview = new MediaStream([track]);
      localVideo.srcObject = localStreamForPreview;
      setIsSharing(true);

      track.onended = () => {
        setIsSharing(false);
        // remove local preview
        const el = document.getElementById("video-self");
        if (el) el.remove();
        // no need to notify server; when track ends peers will see track removed
      };
    } catch (e) {
      alert("Ekran paylaşımı başarısız: " + (e.message || e));
    }
  };

  return (
    <div className="app">
      <div className="sidebar">
        <RoomList rooms={ROOMS} currentRoom={room} usersByRoom={usersByRoom} onSelect={selectRoom} />
        <div className="mebox">
          <input placeholder="Kullanıcı adın" value={username} onChange={e => setUsername(e.target.value)} />
          {!joined ? (
            <button onClick={joinRoom}>Katıl</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={leaveRoom}>Ayrıl</button>
              <button onClick={shareScreen}>{isSharing ? "Ekran Paylaşımı Bitir" : "Ekran Paylaş"}</button>
              <button onClick={toggleSelfMonitor}>{selfMonitorOn ? "Monitor Kapat" : "Self Monitor"}</button>
            </div>
          )}
        </div>
      </div>

      <div className="main">
        <ChatArea room={room} myName={username} />
        <div id="screen-holder" style={{ marginTop: 12 }} />
      </div>

      <div className="right">
        <UserPanel users={roomUsers} myId={socket.id} onVolumeChange={changeVolume} speakingMap={speakingMap} />
        <div id="audio-holder" style={{ display: "none" }} />
      </div>
    </div>
  );
}
