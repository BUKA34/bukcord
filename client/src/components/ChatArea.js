import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

export default function ChatArea({ room, myName }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const messagesRef = useRef();

  useEffect(() => {
    if (!room) return;
    const initHandler = (msgs) => setMessages(msgs || []);
    const newHandler = (m) => setMessages(prev => [...prev, m]);

    socket.on("init-messages", initHandler);
    socket.on("new-message", newHandler);

    // cleanup when switching rooms
    return () => {
      socket.off("init-messages", initHandler);
      socket.off("new-message", newHandler);
      setMessages([]);
    };
  }, [room]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    const payload = { room, username: myName || "anon", text, ts: Date.now() };
    socket.emit("send-message", payload);
    setText("");
  };

  return (
    <div className="chat-area">
      <div className="messages" ref={messagesRef}>
        {messages.map((m, i) => (
          <div key={i} className="msg">
            <span className="msg-user">{m.username}</span>
            <span className="msg-text">{m.text}</span>
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`#${room} kanalına mesaj gönder...`}
          onKeyDown={e => e.key === "Enter" && send()}
        />
        <button onClick={send}>Gönder</button>
      </div>
    </div>
  );
}
