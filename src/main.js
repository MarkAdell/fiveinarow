import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

const socket = io(socketUrl, {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
});

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error);
});

socket.on("disconnect", (reason) => {
  console.log("Socket disconnected:", reason);
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log(`Socket attempting to reconnect: attempt ${attemptNumber}`);
});

socket.on("reconnect_failed", () => {
  console.error("Socket failed to reconnect after all attempts");
});

const app = createApp(App);

// Provide socket globally
app.provide("socket", socket);

app.mount("#app");
