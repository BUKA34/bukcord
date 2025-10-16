// server/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let users = {}; // { socket.id: { username, room } }

io.on("connection", (socket) => {
  console.log("Yeni bağlantı:", socket.id);

  socket.on("join-room", ({ room, username }) => {
    // Eğer başka odadaysa önce çıkar
    if (users[socket.id]?.room) {
      socket.leave(users[socket.id].room);
    }

    socket.join(room);
    users[socket.id] = { username, room };
    console.log(`${username} ${room} odasına katıldı`);

    io.to(room).emit("user-list", getUsersInRoom(room));
    socket.emit("joined", room);
  });

  socket.on("screen-share", ({ room, signal }) => {
    socket.to(room).emit("screen-share", { from: socket.id, signal });
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      console.log(`${user.username} ayrıldı`);
      socket.to(user.room).emit("user-left", user.username);
      delete users[socket.id];
      io.to(user.room).emit("user-list", getUsersInRoom(user.room));
    }
  });
});

function getUsersInRoom(room) {
  return Object.values(users)
    .filter((u) => u.room === room)
    .map((u) => u.username);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✅ Server ${PORT} portunda çalışıyor`));
