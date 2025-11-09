// backend/src/app.js
// Load environment variables FIRST (this must be the first import!)
import './config/env.js';

import express from "express";
import path from 'path';
import cors from "cors";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";

// Routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import friendRoutes from "./routes/friends.js";
import messageRoutes from "./routes/messages.js";

// Services
import emailService from "./services/emailService.js";

// WebSocket server
import { initializeWebSocketServer } from './websocket/server.js';

const app = express();
const server = createServer(app);

// Initialize WebSocket server with HTTP server
const { io, connectedUsers } = initializeWebSocketServer(server);

// Make io and connectedUsers available to routes
app.set('io', io);
app.set('connectedUsers', connectedUsers);

// Security middleware
// Allow Cross-Origin Resource Policy for static assets (avatars) so images served
// from the backend can be loaded by the frontend running on a different origin.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// MongoDB Connection Configuration
const connectToMongoDB = async (retries = 3) => {
  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // Increased timeout
    socketTimeoutMS: 45000,
    family: 4,  // Force IPv4
    retryWrites: true,
    w: 'majority'
    // Removed directConnection as it's not compatible with SRV URLs
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Try MongoDB Atlas first
      try {
        console.log(`📡 Attempting to connect to MongoDB Atlas (Attempt ${attempt}/${retries})...`);
        await mongoose.connect(process.env.MONGODB_URI, options);
        console.log("✅ Connected to MongoDB Atlas");
        console.log("📊 Database:", mongoose.connection.name);
        return true;
      } catch (atlasError) {
        console.log("⚠️ Could not connect to Atlas, trying local MongoDB...");
        
        // Try local MongoDB as fallback
        await mongoose.connect("mongodb://localhost:27017/signlink", options);
        console.log("✅ Connected to Local MongoDB");
        console.log("📊 Database:", mongoose.connection.name);
        return true;
      }
    } catch (error) {
      console.error(`❌ MongoDB connection error (Attempt ${attempt}/${retries}):`, error.message);
      
      if (attempt === retries) {
        throw new Error(`Failed to connect to MongoDB after ${retries} attempts`);
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// Add MongoDB connection event listeners
mongoose.connection.on('connected', () => console.log('🟢 Mongoose connection established'));
mongoose.connection.on('error', err => console.error('🔴 Mongoose connection error:', err));
mongoose.connection.on('disconnected', () => console.log('🟠 Mongoose disconnected'));

// Initialize MongoDB connection
connectToMongoDB().catch(err => {
  console.error("❌ Failed to establish initial connection:", err.message);
});

// Enhanced CORS configuration
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3001",
      "http://localhost:5173", 
      "http://localhost:3000",
      "http://127.0.0.1:3001",
      "http://192.168.0.195:3001"
    ];
    
    // Allow any origin from local network (192.168.x.x)
    if (origin.match(/^http:\/\/192\.168\.\d+\.\d+:\d+$/)) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      callback(null, true); // Allow for development, change to false for production
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files (avatars, etc.)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Origin:', req.headers.origin);
  console.log('Authorization:', req.headers.authorization ? 'Present' : 'Missing');
  next();
});

// Routes
app.get("/", (req, res) => {
  res.json({ 
    success: true,
    message: "SignLink Backend API with Socket.io",
    version: "1.1.0",
    endpoints: {
      auth: "/api/auth",
      users: "/api/users", 
      friends: "/api/friends",
      messages: "/api/messages",
      health: "/api/health"
    },
    websocket: "Socket.io on same port as API",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", async (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  const statusMessages = {
    0: "disconnected",
    1: "connected", 
    2: "connecting",
    3: "disconnecting"
  };

  let dbDetails = {
    status: statusMessages[dbStatus] || "unknown",
    host: mongoose.connection.host || "Not connected",
    name: mongoose.connection.name || "Not connected",
    port: mongoose.connection.port || "Not connected"
  };

  // Test database operation
  let dbOperational = false;
  if (dbStatus === 1) {
    try {
      await mongoose.connection.db.admin().ping();
      dbOperational = true;
    } catch (error) {
      console.error("Database ping failed:", error.message);
    }
  }
  
  res.json({ 
    success: true,
    status: "OK", 
    message: "SignLink API with Socket.io is running",
    database: {
      ...dbDetails,
      operational: dbOperational
    },
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/messages", messageRoutes);

// Call route handler
app.get("/call/:roomId", (req, res) => {
  res.json({ 
    success: true,
    message: "Call room endpoint",
    roomId: req.params.roomId,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.originalUrl
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("🔴 Server Error:", error);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production" 
      ? "Internal server error" 
      : error.message,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, async () => {
  console.log("\n🚀 SignLink Backend Server Started!");
  console.log("📍 Port:", PORT);
  console.log("🔌 Socket.io: Running on same port");
  console.log("🌍 Frontend: http://localhost:3001/");
  console.log("📊 Database:", process.env.MONGODB_URI ? "MongoDB Atlas" : "Local");
  console.log("💡 Health Check: http://localhost:" + PORT + "/api/health");
  console.log("👥 Friends API: http://localhost:" + PORT + "/api/friends");
  console.log("🔑 Auth API: http://localhost:" + PORT + "/api/auth");
  console.log("👤 Users API: http://localhost:" + PORT + "/api/users");
  console.log("💬 Messages API: http://localhost:" + PORT + "/api/messages");
  console.log("🔧 CORS Enabled for:", [
    "http://localhost:3001",
    "http://localhost:5173", 
    "http://localhost:3000"
  ].join(", "));
  
  // Verify SMTP configuration
  console.log("\n📧 Checking SMTP configuration...");
  const smtpReady = await emailService.verifyConnection();
  if (!smtpReady) {
    console.log("⚠️  SMTP not configured. Email verification will not work.");
    console.log("💡 To enable emails, configure SMTP settings in .env file");
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🔻 Shutting down gracefully...");
  await mongoose.connection.close();
  console.log("✅ MongoDB connection closed.");
  process.exit(0);
});