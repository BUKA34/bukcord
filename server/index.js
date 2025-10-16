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
const io = new Server(server, { cors: { origin: "*" }});

const PORT = process.env.PORT || 3001;
const MESSAGES_FILE = path.join(__dirname, "messages.json");

// Ensure messages file exists and has object structure { "Oda 1":[], ... }
let messages = {};
if (fs.existsSync(MESSAGES_FILE)) {
  try { messages = JSON.parse(fs.readFileSync(MESSAGES_FILE)); } catch (e) { messages = {}; }
}
if (!messages["Oda 1"]) messages["Oda 1"] = [];
if (!messages["Oda 2"]) messages["Oda 2"] = [];
if (!messages["Oda 3"]) messages["Oda 3"] = [];
if (!messages["Oda 4"]) messages["Oda 4"] = [];
fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));

// users: { socketId: { username, room } }
const users = {};

// helper to persist messages object
function saveMessages() {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

app.get("/health", (req, res) => res.send("Bukcord server running"));
app.get("/rooms/:room/messages", (req, res) => {
  const room = req.params.room;
  res.json(messages[room] || []);
});

io.on("connection", (socket) => {
  console.log("Yeni bağlantı:", socket.id);

  socket.on("join-room", ({ room, username }) => {
    socket.join(room);
    users[socket.id] = { username, room };
    // inform room about users
    const roomUsers = Object.entries(users)
      .filter(([id, u]) => u.room === room)
      .map(([id, u]) => ({ id, username: u.username }));
    io.to(room).emit("room-users", roomUsers);
    // send initial messages
    socket.emit("init-messages", messages[room] || []);
    io.to(room).emit("user-joined", { id: socket.id, username });
    console.log(`${username} joined ${room}`);
  });

  socket.on("send-message", (data) => {
    // data: { room, username, text, ts }
    const { room, username, text, ts } = data;
    if (!messages[room]) messages[room] = [];
    const msg = { username, text, ts: ts || Date.now() };
    messages[room].push(msg);
    saveMessages();
    io.to(room).emit("new-message", msg);
  });

  // WebRTC signaling forwarding
  socket.on("signal", (data) => {
    // data: { to, from?, signal }
    if (data && data.to) {
      io.to(data.to).emit("signal", { from: socket.id, signal: data.signal });
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
      console.log(`${username} left ${room}`);
    }
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
