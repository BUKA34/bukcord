import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("https://bukcord.onrender.com"); // Render backend adresi

function App() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("Oda 1");
  const [joined, setJoined] = useState(false);
  const [users, setUsers] = useState([]);
  const peerConnections = useRef({});
  const localStream = useRef(null);

  // Odaya katıl
  const joinRoom = async () => {
    if (!username) return alert("Kullanıcı adını gir!");
    setJoined(true);

    // Sadece mikrofon al
    localStream.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    socket.emit("join-room", room, username);
  };

  useEffect(() => {
    // Yeni biri katıldığında bağlantı başlat
    socket.on("user-joined", async (userId) => {
      const peer = new RTCPeerConnection();
      peerConnections.current[userId] = peer;

      localStream.current.getTracks().forEach((track) => peer.addTrack(track, localStream.current));

      peer.onicecandidate = (e) => {
        if (e.candidate) socket.emit("signal", { to: userId, signal: { candidate: e.candidate } });
      };

      peer.ontrack = (e) => {
        const audio = document.createElement("audio");
        audio.srcObject = e.streams[0];
        audio.autoplay = true;
        audio.controls = false;
        audio.id = `audio-${userId}`;
        document.getElementById("audioContainer").appendChild(audio);
        setUsers((prev) => [...new Set([...prev, userId])]);
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("signal", { to: userId, signal: { sdp: offer } });
    });

    // Sinyal işleme
    socket.on("signal", async (data) => {
      let peer = peerConnections.current[data.from];
      if (!peer) {
        peer = new RTCPeerConnection();
        peerConnections.current[data.from] = peer;

        localStream.current.getTracks().forEach((track) => peer.addTrack(track, localStream.current));

        peer.onicecandidate = (e) => {
          if (e.candidate)
            socket.emit("signal", { to: data.from, signal: { candidate: e.candidate } });
        };

        peer.ontrack = (e) => {
          const audio = document.createElement("audio");
          audio.srcObject = e.streams[0];
          audio.autoplay = true;
          audio.controls = false;
          audio.id = `audio-${data.from}`;
          document.getElementById("audioContainer").appendChild(audio);
          setUsers((prev) => [...new Set([...prev, data.from])]);
        };
      }

      if (data.signal.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
        if (data.signal.sdp.type === "offer") {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("signal", { to: data.from, signal: { sdp: answer } });
        }
      } else if (data.signal.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
      }
    });

    socket.on("user-left", (userId) => {
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
        delete peerConnections.current[userId];
      }
      document.getElementById(`audio-${userId}`)?.remove();
      setUsers((prev) => prev.filter((u) => u !== userId));
    });
  }, []);

  // Ses seviyesini ayarla
  const changeVolume = (userId, volume) => {
    const audio = document.getElementById(`audio-${userId}`);
    if (audio) audio.volume = volume;
  };

  return (
    <div style={{ backgroundColor: "#0d1117", color: "#fff", height: "100vh", padding: "20px" }}>
      {!joined ? (
        <div style={{ textAlign: "center", marginTop: "20%" }}>
          <h1>🔊 Bukcord Sesli Sohbet</h1>
          <input
            type="text"
            placeholder="Kullanıcı adın..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: "8px", borderRadius: "8px", marginRight: "10px" }}
          />
          <select
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            style={{ padding: "8px", borderRadius: "8px", marginRight: "10px" }}
          >
            <option>Oda 1</option>
            <option>Oda 2</option>
            <option>Oda 3</option>
            <option>Oda 4</option>
          </select>
          <button
            onClick={joinRoom}
            style={{ padding: "8px 12px", background: "#238636", borderRadius: "8px", color: "#fff" }}
          >
            Katıl
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <h2>{room} odasındasın</h2>
          <p>Bağlı kullanıcılar:</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap" }}>
            {users.map((id) => (
              <div
                key={id}
                style={{
                  background: "#161b22",
                  padding: "10px",
                  borderRadius: "10px",
                  width: "160px",
                }}
              >
                <p>{id}</p>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue="1"
                  onChange={(e) => changeVolume(id, e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>
            ))}
          </div>
          <div id="audioContainer" />
        </div>
      )}
    </div>
  );
}

export default App;
