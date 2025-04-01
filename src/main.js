import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

const socket = io(socketUrl, {
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 60000, // Longer timeout (60 seconds)
  pingInterval: 10000, // Send a ping every 10 seconds
  pingTimeout: 30000, // Wait 30 seconds for a ping response
  autoConnect: true,
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

socket.on("reconnect", () => {
  console.log("Socket reconnected");
});

socket.on("reconnect_failed", () => {
  console.error("Socket failed to reconnect after all attempts");
});

// Keep the app active when phone is in background
if (typeof document !== "undefined") {
  // Create a hidden audio element that keeps the page active
  const silentAudio = document.createElement("audio");
  silentAudio.src =
    "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
  silentAudio.loop = true;
  silentAudio.autoplay = true;
  silentAudio.muted = true;
  silentAudio.volume = 0.01;
  document.body.appendChild(silentAudio);

  // Fix for iOS, play on user interaction
  document.addEventListener(
    "click",
    () => {
      silentAudio
        .play()
        .catch((e) => console.log("Silent audio play failed:", e));
    },
    { once: true }
  );
}

const app = createApp(App);

// Provide socket globally
app.provide("socket", socket);

app.mount("#app");
