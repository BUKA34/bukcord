// server/index.js
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  // transports default is fine; websockets + polling allowed
});

const PORT = process.env.PORT || 3001;
const MESSAGES_FILE = path.join(__dirname, "messages.json");

// ensure messages file exists and has rooms
let messages = {};
if (fs.existsSync(MESSAGES_FILE)) {
  try { messages = JSON.parse(fs.readFileSync(MESSAGES_FILE)); } catch (e) { messages = {}; }
}
if (!messages["Oda 1"]) messages["Oda 1"] = [];
if (!messages["Oda 2"]) messages["Oda 2"] = [];
if (!messages["Oda 3"]) messages["Oda 3"] = [];
if (!messages["Oda 4"]) messages["Oda 4"] = [];
fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), "utf8");

// users: { socketId: { username, room } }
const users = {};

// helper to persist messages
function saveMessages() {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), "utf8");
}

// simple HTTP endpoints
app.get("/health", (req, res) => res.send("Bukcord server running"));
app.get("/rooms/:room/messages", (req, res) => {
  const room = req.params.room;
  res.json(messages[room] || []);
});

io.on("connection", (socket) => {
  console.log("Yeni bağlantı:", socket.id);

  // Helper: leave all rooms except own private room
  const leaveAllRooms = () => {
    // socket.rooms is a Set (in newer socket.io), includes socket.id
    const rooms = Array.from(socket.rooms || []);
    rooms.forEach(r => {
      if (r !== socket.id) socket.leave(r);
    });
  };

  socket.on("join-room", ({ room, username }) => {
    try {
      // ensure user leaves other rooms first (only one room at a time)
      leaveAllRooms();

      socket.join(room);
      users[socket.id] = { username, room };

      // prepare room users list
      const roomUsers = Object.entries(users)
        .filter(([id, u]) => u.room === room)
        .map(([id, u]) => ({ id, username: u.username }));

      // send updated users to everyone in room
      io.to(room).emit("room-users", roomUsers);

      // send stored messages to new user
      socket.emit("init-messages", messages[room] || []);

      // notify room
      io.to(room).emit("user-joined", { id: socket.id, username });

      console.log(`${username} (${socket.id}) joined ${room}`);
    } catch (err) {
      console.error("join-room error:", err);
    }
  });

  socket.on("leave-room", ({ room, username }) => {
    try {
      socket.leave(room);
      if (users[socket.id]) delete users[socket.id];

      const roomUsers = Object.entries(users)
        .filter(([id, u]) => u.room === room)
        .map(([id, u]) => ({ id, username: u.username }));

      io.to(room).emit("room-users", roomUsers);
      io.to(room).emit("user-left", { id: socket.id, username });

      console.log(`${username} (${socket.id}) left ${room}`);
    } catch (err) {
      console.error("leave-room error:", err);
    }
  });

  socket.on("send-message", (data) => {
    // data: { room, username, text, ts }
    try {
      const { room, username, text, ts } = data;
      if (!room) return;
      if (!messages[room]) messages[room] = [];
      const msg = { username, text, ts: ts || Date.now() };
      messages[room].push(msg);
      saveMessages();
      io.to(room).emit("new-message", msg);
    } catch (err) {
      console.error("send-message error:", err);
    }
  });

  // WebRTC signaling forwarding (for both mic-only and screen share tracks)
  socket.on("signal", (data) => {
    // data: { to, signal }
    try {
      if (data && data.to) {
        io.to(data.to).emit("signal", { from: socket.id, signal: data.signal });
      }
    } catch (err) {
      console.error("signal forward error:", err);
    }
  });

  socket.on("disconnect", () => {
    const u = users[socket.id];
    if (u) {
      const { room, username } = u;
      delete users[socket.id];

      const roomUsers = Object.entries(users)
        .filter(([id, uu]) => uu.room === room)
        .map(([id, uu]) => ({ id, username: uu.username }));

      io.to(room).emit("room-users", roomUsers);
      io.to(room).emit("user-left", { id: socket.id, username });

      console.log(`${username} (${socket.id}) disconnected from ${room}`);
    } else {
      console.log("disconnect (no user entry):", socket.id);
    }
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
