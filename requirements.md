# Project: Five In A Row

## 📦 Tech Stack

- **Frontend:** Vue 3 (Composition API + Vite)
- **Backend:** Node.js with Express.js
- **Real-time Communication:** Socket.io
- **Styling:** TailwindCSS (optional but recommended)

## 🔹 General

- Multiplayer game for 2 players
- Real-time gameplay
- Unique room generation
- Join by room ID or link
- Score tracking

## 🔹 Game Logic

- Players take turns placing a piece on an empty cell
- First to form 5 in a row (horizontal, vertical, or diagonal) wins
- After win, update score
- Highlight winning line (optional)

## Pages / Views

1. **Home**
   - Options to "Create a Room" or "Join a Room"

2. **Create Room**
   - Generates a unique room ID
   - Shows sharable link

3. **Join Room**
   - Input field for room ID
   - Validates room and connects player

4. **Game Board**
   - Grid board (15x15 or configurable)
   - Players take turns placing marks
   - Real-time sync using socket events
   - Display scores