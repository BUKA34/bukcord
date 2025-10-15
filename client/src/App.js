import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

const socket = io("https://bukcord.onrender.com"); // Render backend adresi

function App() {
  const [room, setRoom] = useState("Lobby");
  const [joined, setJoined] = useState(false);
  const [username, setUsername] = useState("");
  const [peers, setPeers] = useState({});
  const localVideoRef = useRef(null);
  const peerConnections = useRef({});
  const localStream = useRef(null);

  // Odaya katılma
  const joinRoom = async () => {
    if (!username) return alert("Lütfen kullanıcı adını gir!");
    setJoined(true);

    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideoRef.current.srcObject = localStream.current;

    socket.emit("join-room", room, username);
  };

  // WebRTC sinyalleri
  useEffect(() => {
    socket.on("user-joined", async (userId) => {
      const peer = new RTCPeerConnection();
      localStream.current.getTracks().forEach((track) => peer.addTrack(track, localStream.current));
      peerConnections.current[userId] = peer;

      peer.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("signal", { to: userId, signal: { candidate: e.candidate } });
        }
      };

      peer.ontrack = (e) => {
        const video = document.createElement("video");
        video.srcObject = e.streams[0];
        video.autoplay = true;
        video.playsInline = true;
        video.className = "rounded-xl w-1/3 p-2";
        document.getElementById("remoteVideos").appendChild(video);
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("signal", { to: userId, signal: { sdp: offer } });
    });

    socket.on("signal", async (data) => {
      let peer = peerConnections.current[data.from];
      if (!peer) {
        peer = new RTCPeerConnection();
        localStream.current.getTracks().forEach((track) => peer.addTrack(track, localStream.current));
        peerConnections.current[data.from] = peer;

        peer.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit("signal", { to: data.from, signal: { candidate: e.candidate } });
          }
        };

        peer.ontrack = (e) => {
          const video = document.createElement("video");
          video.srcObject = e.streams[0];
          video.autoplay = true;
          video.playsInline = true;
          video.className = "rounded-xl w-1/3 p-2";
          document.getElementById("remoteVideos").appendChild(video);
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
    });
  }, []);

  const shareScreen = async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getTracks()[0];

    for (const peer of Object.values(peerConnections.current)) {
      const sender = peer.getSenders().find((s) => s.track.kind === "video");
      sender.replaceTrack(screenTrack);
    }

    screenTrack.onended = () => {
      for (const peer of Object.values(peerConnections.current)) {
        const sender = peer.getSenders().find((s) => s.track.kind === "video");
        sender.replaceTrack(localStream.current.getTracks().find((t) => t.kind === "video"));
      }
    };
  };

  return (
    <div style={{ backgroundColor: "#0d1117", color: "#fff", height: "100vh", padding: "20px" }}>
      {!joined ? (
        <div style={{ textAlign: "center", marginTop: "20%" }}>
          <h1>🎧 Bukcord Dark Mode</h1>
          <input
            type="text"
            placeholder="Kullanıcı adını gir..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: "8px", borderRadius: "8px", marginRight: "10px" }}
          />
          <button
            onClick={joinRoom}
            style={{ padding: "8px 12px", background: "#238636", borderRadius: "8px", color: "#fff" }}
          >
            Odaya Katıl
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <h2>{room} odasındasın</h2>
          <video ref={localVideoRef} autoPlay playsInline muted className="rounded-xl w-1/3 p-2" />
          <div id="remoteVideos" style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}></div>
          <button
            onClick={shareScreen}
            style={{ marginTop: "20px", background: "#30363d", color: "#fff", padding: "10px 16px", borderRadius: "8px" }}
          >
            Ekran Paylaş
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
