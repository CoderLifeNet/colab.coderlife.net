const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const fs = require("fs");

let httpProtocol = null;
if (process.env.SERVER_ENV === "development") {
  httpProtocol = require("http");
} else {
  httpProtocol = require("https");
}
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();

let server = null;
if (process.env.SERVER_ENV === "development") {
  server = httpProtocol.createServer(app);
} else {
  server = httpProtocol.createServer(
    {
      cert: fs.readFileSync(
        "/etc/letsencrypt/live/colab.coderlife.net/fullchain.pem"
      ),
      key: fs.readFileSync(
        "/etc/letsencrypt/live/colab.coderlife.net/privkey.pem"
      ),
    },
    app
  );
}

const wss = new WebSocket.Server({ server });

let rooms = {}; // Store active rooms and their members
let roomTexts = {}; // Store current text state for each room
let roomNames = {}; // Store room names
let userMetadata = {}; // Store user metadata (IP, username, etc.)
let totalParticipants = 0; // Track total number of participants

app.use(
  "/",
  express.static(path.join(__dirname, "../", "public"), { maxAge: 31557600000 })
);

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Serve the room page
app.get("/box/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Serve the terms of service page
app.get("/terms.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/terms.html"));
});

// Serve the privacy policy page
app.get("/privacy.html", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/privacy.html"));
});

const keepAliveInterval = 30000; // 30 seconds

wss.on("connection", (ws, req) => {
  ws.isAlive = true;

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (!client.isAlive) {
        return client.terminate();
      }

      client.isAlive = false;
      client.ping();
    });
  }, keepAliveInterval);

  ws.on("close", () => {
    clearInterval(interval);
  });

  ws.rooms = new Set(); // Initialize rooms set for each WebSocket connection
  const ip = req.socket.remoteAddress;
  totalParticipants++; // Increment total participants count
  broadcastStats(); // Broadcast updated stats

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "CREATE_ROOM":
        const roomId = uuidv4();
        rooms[roomId] = [ws];
        roomTexts[roomId] = ""; // Initialize empty text for the room
        roomNames[roomId] = data.roomName || roomId; // Initialize room name
        userMetadata[ip] = { username: data.username, ip };
        ws.rooms.add(roomId);
        ws.send(
          JSON.stringify({
            type: "ROOM_CREATED",
            roomId,
            roomName: roomNames[roomId],
          })
        );
        broadcastStats(); // Broadcast updated stats
        break;

      case "JOIN_ROOM":
        const room = rooms[data.roomId];
        if (room) {
          if (isUserKicked(ip, data.roomId)) {
            ws.send(
              JSON.stringify({
                type: "ERROR",
                message: "You have been kicked from this room.",
              })
            );
            return;
          }
          room.push(ws);
          ws.rooms.add(data.roomId);
          userMetadata[ip] = { username: data.username, ip };
          ws.send(
            JSON.stringify({
              type: "JOINED_ROOM",
              roomId: data.roomId,
              text: roomTexts[data.roomId],
              roomName: roomNames[data.roomId],
              isCreator: false,
            })
          );
          room.forEach((member) => {
            if (member !== ws) {
              member.send(
                JSON.stringify({ type: "NEW_MEMBER", roomId: data.roomId })
              );
            }
          });
          broadcastStats(); // Broadcast updated stats
        } else {
          ws.send(JSON.stringify({ type: "ERROR", message: "Room not found" }));
        }
        break;

      case "SEND_MESSAGE":
        const targetRoom = rooms[data.roomId];
        if (targetRoom) {
          roomTexts[data.roomId] = data.message; // Update the text state for the room
          targetRoom.forEach((member) => {
            member.send(
              JSON.stringify({
                type: "MESSAGE",
                roomId: data.roomId,
                message: data.message,
                from: data.from,
              })
            );
          });
        }
        break;

      case "RENAME_ROOM":
        if (rooms[data.roomId]) {
          roomNames[data.roomId] = data.newName; // Update the room name
          rooms[data.roomId].forEach((member) => {
            member.send(
              JSON.stringify({
                type: "ROOM_RENAMED",
                roomId: data.roomId,
                newName: data.newName,
              })
            );
          });
        }
        break;

      case "CLOSE_ROOM":
        if (rooms[data.roomId]) {
          rooms[data.roomId].forEach((member) => {
            member.send(
              JSON.stringify({ type: "ROOM_CLOSED", roomId: data.roomId })
            );
          });
          delete rooms[data.roomId];
          delete roomTexts[data.roomId];
          delete roomNames[data.roomId];
          broadcastStats(); // Broadcast updated stats
        }
        break;

      case "LEAVE_ROOM":
        if (rooms[data.roomId]) {
          rooms[data.roomId] = rooms[data.roomId].filter(
            (member) => member !== ws
          );
          if (rooms[data.roomId].length === 0) {
            delete rooms[data.roomId];
            delete roomTexts[data.roomId];
            delete roomNames[data.roomId];
          }
          ws.rooms.delete(data.roomId);
          ws.send(JSON.stringify({ type: "LEFT_ROOM", roomId: data.roomId }));
          broadcastStats(); // Broadcast updated stats
        }
        break;

      case "DISCONNECT":
        for (const roomId of ws.rooms) {
          if (rooms[roomId]) {
            rooms[roomId] = rooms[roomId].filter((member) => member !== ws);
            if (rooms[roomId].length === 0) {
              delete rooms[roomId];
              delete roomTexts[roomId];
              delete roomNames[roomId];
            }
          }
        }
        ws.rooms.clear();
        broadcastStats(); // Broadcast updated stats
        break;
    }
  });

  ws.on("close", () => {
    totalParticipants--; // Decrement total participants count
    if (!ws.rooms) return;
    for (const roomId of ws.rooms) {
      if (rooms[roomId]) {
        rooms[roomId] = rooms[roomId].filter((member) => member !== ws);
        if (rooms[roomId].length === 0) {
          delete rooms[roomId];
          delete roomTexts[roomId];
          delete roomNames[roomId];
        }
      }
    }
    ws.rooms.clear();
    broadcastStats(); // Broadcast updated stats
  });
});

server.listen(process.env.SERVER_PORT, () => {
  console.log("Server is listening on port 3544");
});

function formatMemoryUsage(memoryUsage) {
  const formattedUsage = {};
  for (const key in memoryUsage) {
    formattedUsage[key] = (memoryUsage[key] / 1024 / 1024).toFixed(2) + " MB";
  }
  return formattedUsage;
}

function isUserKicked(ip, roomId) {
  // Implement logic to check if the user with the given IP is kicked from the room
  // Return true if kicked, false otherwise
  return false;
}

function broadcastStats() {
  const activeRooms = Object.keys(rooms).length;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({ type: "STATS_UPDATE", totalParticipants, activeRooms })
      );
    }
  });
}

// setInterval(() => {
//   const memoryUsage = process.memoryUsage();
//   const formattedMemoryUsage = formatMemoryUsage(memoryUsage);

//   console.log(`Memory Usage:
//       RSS (Resident Set Size): ${formattedMemoryUsage.rss}
//       Heap Total: ${formattedMemoryUsage.heapTotal}
//       Heap Used: ${formattedMemoryUsage.heapUsed}
//       External: ${formattedMemoryUsage.external}
//       Array Buffers: ${formattedMemoryUsage.arrayBuffers}`);
// }, 60000); // Logs memory usage every minute
