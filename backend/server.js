const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIo = require("socket.io");
const setupMatchingSocket = require("./sockets/matchingSocket");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

// Setup Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});
app.use(cors());
app.use(express.json());

// Routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const rideRoutes = require("./routes/rides");
const connectionRoutes = require("./routes/connections");
const matchingRoutes = require("./routes/matching");

app.use("/api/auth", authRoutes); // Register/Login
app.use("/api/users", userRoutes); // CRUD operations
app.use("/api/rides", rideRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api/matching", matchingRoutes);

// Setup Socket.IO for real-time matching
io.on("connection", (socket) => {
  console.log("SOCKET CONNECTED:", socket.id);
});
setupMatchingSocket(io);

// Health check endpoint
app.get("/api/health", (req, res) => {
  const dbState = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  res.json({
    status: "ok",
    db: dbState,
    port: process.env.PORT || 5001,
    socketConnections: io.engine.clientsCount
  });
});

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const PORT = process.env.PORT || 5001;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🔌 Socket.IO enabled for real-time matching`);
    });
  } catch (err) {
    console.error("Mongo connection error:", err.message);
    process.exit(1);
  }
};

start();
