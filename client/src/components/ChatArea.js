import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

export default function ChatArea({ room }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const messagesRef = useRef();

  useEffect(() => {
    if (!room) return;
    // request initial messages happens on join; but ensure listener
    const initHandler = (msgs) => setMessages(msgs || []);
    const newHandler = (m) => setMessages(prev => [...prev, m]);

    socket.on("init-messages", initHandler);
    socket.on("new-message", newHandler);

    return () => {
      socket.off("init-messages", initHandler);
      socket.off("new-message", newHandler);
    };
  }, [room]);

  useEffect(() => {
    // scroll to bottom
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    socket.emit("send-message", { room, username: socket.username || "anon", text, ts: Date.now() });
    setText("");
  };

  return (
    <div className="chat-area">
      <div className="messages" ref={messagesRef}>
        {messages.map((m, i) => (
          <div key={i} className="msg">
            <b>{m.username}:</b> <span>{m.text}</span>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Mesaj yaz..." onKeyDown={e => e.key === "Enter" && send()} />
        <button onClick={send}>Gönder</button>
      </div>
    </div>
  );
}
