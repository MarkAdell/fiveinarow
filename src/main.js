import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.DEV
  ? "http://localhost:3000"
  : window.location.origin;

// Check if this is a mobile device
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
console.log("Device detection:", isMobile ? "Mobile device" : "Desktop device");

const socket = io(socketUrl, {
  reconnectionAttempts: 30, // More attempts for mobile
  reconnectionDelay: 250, // Start with a very short delay
  reconnectionDelayMax: 1000, // Cap at 1 second for faster recovery
  timeout: 10000, // Shorter timeout
  pingInterval: isMobile ? 2000 : 5000, // Super aggressive pings on mobile (2 sec)
  pingTimeout: 5000, // Shorter ping timeout
  forceNew: false,
  autoConnect: true,
  transports: ["websocket", "polling"], // Try WebSocket first, fallback to polling
});

socket.on("connect_error", (error) => {
  console.error("Socket connection error:", error);
});

socket.on("disconnect", (reason) => {
  console.log("Socket disconnected:", reason);

  // Try to reconnect immediately for mobile devices on app switch related disconnects
  if (isMobile && (reason === "transport close" || reason === "ping timeout")) {
    console.log(
      "Mobile disconnect detected, attempting immediate reconnection"
    );
    socket.connect();
  }
});

socket.on("reconnect_attempt", (attemptNumber) => {
  console.log(`Socket attempting to reconnect: attempt ${attemptNumber}`);
});

socket.on("reconnect", () => {
  console.log("Socket reconnected");
});

socket.on("reconnect_failed", () => {
  console.error("Socket failed to reconnect after all attempts");
  // Last resort - reload the page if all reconnection attempts fail
  if (isMobile) {
    console.log(
      "All reconnection attempts failed on mobile, trying page reload"
    );
    window.location.reload();
  }
});

// Keep the app active when in background
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

  // Keep screen awake when possible
  if ("wakeLock" in navigator) {
    let wakeLock = null;

    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
        console.log("Wake Lock activated");
      } catch (err) {
        console.error(`Wake Lock error: ${err.name}, ${err.message}`);
      }
    };

    // Request wake lock when the page becomes visible
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !wakeLock) {
        requestWakeLock();
      }
    });

    // Try to get it initially
    if (!document.hidden) {
      requestWakeLock();
    }
  }
}

const app = createApp(App);

// Provide socket globally
app.provide("socket", socket);

app.mount("#app");
