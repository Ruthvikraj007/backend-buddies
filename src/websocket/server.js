// backend/src/websocket/server.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// Store connected users
export const connectedUsers = new Map();

export function initializeWebSocketServer(server) {
  console.log('🔌 Initializing WebSocket server...');

  // Create Socket.io server with CORS configuration
  const io = new Server(server, {
    cors: {
      origin: [
        "http://localhost:3001",
        "http://localhost:5173", 
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://192.168.0.195:3001"
      ],
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  console.log(`✅ WebSocket server attached to HTTP server`);

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log('❌ No token provided');
      return next(new Error('Authentication error: No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (error) {
      console.error('❌ Token verification failed:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('🔗 New client connected:', socket.id, 'User:', socket.username);

    // Store user connection
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      username: socket.username,
      connectedAt: new Date()
    });

    console.log(`✅ User connected: ${socket.username} (${socket.userId})`);
    
    // Notify others that user is online
    socket.broadcast.emit('user_online', {
      userId: socket.userId,
      username: socket.username,
      timestamp: new Date().toISOString()
    });

    // Send current online users to the newly connected user
    const onlineUsers = Array.from(connectedUsers.entries()).map(([userId, data]) => ({
      userId,
      username: data.username,
      socketId: data.socketId
    }));
    
    socket.emit('online_users', { users: onlineUsers });

    // Handle user online status (redundant but kept for compatibility)
    socket.on('user_online', (userData) => {
      console.log('🟢 User online event:', userData.username);
      // User is already authenticated via middleware
    });

    // Handle chat messages
    socket.on('chat_message', (data) => {
      console.log('💬 Chat message from:', socket.username, 'to:', data.recipientId);
      
      const recipientData = connectedUsers.get(data.recipientId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('chat_message', {
          ...data,
          senderId: socket.userId,
          senderUsername: socket.username,
          timestamp: new Date().toISOString()
        });
        
        // Send delivery confirmation
        socket.emit('message_delivered', {
          messageId: data.messageId,
          recipientId: data.recipientId,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('⚠️ Recipient not online:', data.recipientId);
      }
    });

    // Handle typing indicators
    socket.on('typing_start', (data) => {
      const recipientData = connectedUsers.get(data.recipientId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('typing_start', {
          senderId: socket.userId,
          senderUsername: socket.username,
          timestamp: new Date().toISOString()
        });
      }
    });

    socket.on('typing_end', (data) => {
      const recipientData = connectedUsers.get(data.recipientId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('typing_end', {
          senderId: socket.userId,
          senderUsername: socket.username,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Video Call Handlers
    socket.on('initiate_call', (callData) => {
      console.log('📞 Call initiated:', socket.username, 'to:', callData.targetUsername);
      
      const recipientData = connectedUsers.get(callData.targetUserId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('incoming_call', {
          callId: callData.callId,
          roomId: callData.roomId,
          callerId: socket.userId,
          callerName: socket.username,
          callerUsername: socket.username,
          timestamp: new Date().toISOString()
        });
        console.log('✅ Call invitation sent to:', callData.targetUsername);
      } else {
        console.log('⚠️ Recipient not online for call:', callData.targetUsername);
        socket.emit('call_rejected', {
          callId: callData.callId,
          targetUsername: callData.targetUsername,
          reason: 'User not online'
        });
      }
    });

    socket.on('accept_call', (data) => {
      console.log('✅ Call accepted by:', socket.username);
      console.log('📞 Accept call data:', data);
      
      // Find the caller's socket and notify them
      const callerEntry = Array.from(connectedUsers.entries()).find(
        ([userId, userData]) => userId === data.callerId
      );
      
      if (callerEntry) {
        const [callerId, callerData] = callerEntry;
        const responseData = {
          callId: data.callId,
          roomId: data.roomId,
          targetUserId: socket.userId,  // ID of the person who accepted
          targetUsername: socket.username  // Username of the person who accepted
        };
        console.log('✅ Sending call_accepted to caller:', callerId, responseData);
        io.to(callerData.socketId).emit('call_accepted', responseData);
      } else {
        console.error('❌ Caller not found in connectedUsers:', data.callerId);
        console.log('📋 Connected users:', Array.from(connectedUsers.keys()));
      }
    });

    socket.on('reject_call', (data) => {
      console.log('❌ Call rejected:', data.callId);
      // Find the caller's socket and notify them
      const callerEntry = Array.from(connectedUsers.entries()).find(
        ([userId, userData]) => userId === data.callerId
      );
      
      if (callerEntry) {
        const [callerId, callerData] = callerEntry;
        io.to(callerData.socketId).emit('call_rejected', {
          callId: data.callId,
          targetUsername: socket.username,
          reason: 'Call rejected by user'
        });
      }
    });

    // WebRTC Signaling
    socket.on('webrtc_offer', (data) => {
      console.log('📨 WebRTC offer for call:', data.callId);
      const recipientData = connectedUsers.get(data.toUserId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('webrtc_offer', {
          ...data,
          fromUserId: socket.userId
        });
      }
    });

    socket.on('webrtc_answer', (data) => {
      console.log('📨 WebRTC answer for call:', data.callId);
      const recipientData = connectedUsers.get(data.toUserId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('webrtc_answer', {
          ...data,
          fromUserId: socket.userId
        });
      }
    });

    socket.on('webrtc_ice_candidate', (data) => {
      console.log('🧊 ICE candidate for call:', data.callId);
      const recipientData = connectedUsers.get(data.toUserId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('webrtc_ice_candidate', {
          ...data,
          fromUserId: socket.userId
        });
      }
    });

    socket.on('webrtc_end_call', (data) => {
      console.log('📞 Call ended:', data.callId);
      const recipientData = connectedUsers.get(data.toUserId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('webrtc_end_call', {
          ...data,
          fromUserId: socket.userId
        });
      }
    });

    // Caption sharing for AI services
    socket.on('send_caption', (data) => {
      console.log('💬 Caption sent to:', data.toUserId, 'Type:', data.caption?.type);
      const recipientData = connectedUsers.get(data.toUserId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('receive_caption', {
          caption: data.caption,
          callId: data.callId,
          fromUserId: socket.userId,
          fromUsername: socket.username
        });
      }
    });

    // Friend request notifications
    socket.on('friend_request_sent', (data) => {
      console.log('📬 Friend request sent to:', data.toUserId);
      const recipientData = connectedUsers.get(data.toUserId);
      if (recipientData) {
        io.to(recipientData.socketId).emit('new_friend_request', {
          requestId: data.requestId,
          fromUser: data.fromUser,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log('🔴 Client disconnected:', socket.id, 'User:', socket.username, 'Reason:', reason);
      
      if (socket.userId) {
        connectedUsers.delete(socket.userId);
        
        // Notify others that user went offline
        socket.broadcast.emit('user_offline', {
          userId: socket.userId,
          username: socket.username,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('🔴 Socket error:', error);
    });
  });

  return { io, connectedUsers };
}