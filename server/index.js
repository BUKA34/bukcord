const express = require("express"); 
const app = express(); 
const http = require("http").Server(app); 
const io = require("socket.io")(http, { cors: { origin: "*" } }); 
const PORT = 3001; 
let users = {}; 
 
io.on("connection", (socket) =
  console.log("Yeni bağlantı:", socket.id); 
  socket.on("join-room", (room, username) =
    socket.join(room); 
    users[socket.id] = { username, room }; 
    io.to(room).emit("user-joined", username); 
  }); 
  socket.on("disconnect", () =
    const user = users[socket.id]; 
    if (user) io.to(user.room).emit("user-left", user.username); 
    delete users[socket.id]; 
  }); 
  socket.on("signal", data =
    io.to(data.to).emit("signal", { from: socket.id, signal: data.signal }); 
  }); 
}); 
http.listen(PORT, () =, PORT)); 
