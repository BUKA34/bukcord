import { io } from "socket.io-client";

const SERVER = process.env.REACT_APP_SERVER_URL || "https://bukcord.onrender.com";
export const socket = io(SERVER, { transports: ["websocket", "polling"] });
