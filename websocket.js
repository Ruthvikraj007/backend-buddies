// backend/websocket.js
const WebSocket = require('ws');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.connectedUsers = new Map(); // userId -> WebSocket
    this.setup();
  }

  setup() {
    this.wss.on('connection', (ws, request) => {
      console.log('✅ New WebSocket connection');
      
      let userId = null;
      let username = null;

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          console.log('📨 Received:', data.type, 'from:', data.userId);

          switch (data.type) {
            case 'auth':
              userId = data.userId;
              username = data.username;
              this.connectedUsers.set(userId, ws);
              console.log(`🔐 User ${username} (${userId}) authenticated`);
              
              // Send confirmation
              this.sendToUser(userId, {
                type: 'auth_success',
                message: 'WebSocket authenticated successfully'
              });
              break;

            case 'webrtc_offer':
              this.handleWebRTCOffer(data);
              break;

            case 'webrtc_answer':
              this.handleWebRTCAnswer(data);
              break;

            case 'webrtc_ice_candidate':
              this.handleICECandidate(data);
              break;

            case 'webrtc_end_call':
              this.handleEndCall(data);
              break;

            case 'call_notification':
              this.handleCallNotification(data);
              break;

            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('❌ Error handling message:', error);
        }
      });

      ws.on('close', () => {
        if (userId) {
          this.connectedUsers.delete(userId);
          console.log(`❌ User ${username} (${userId}) disconnected`);
        }
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });
    });
  }

  handleWebRTCOffer(data) {
    const { targetUserId, offer, callId, userId } = data;
    console.log(`📞 Forwarding WebRTC offer from ${userId} to ${targetUserId}`);
    
    // First send a call notification
    this.sendToUser(targetUserId, {
      type: 'call_notification',
      callId,
      callerId: userId,
      callerName: data.callerName || 'User',
      offer: offer,
      timestamp: new Date().toISOString()
    });
  }

  handleWebRTCAnswer(data) {
    const { targetUserId, answer, callId, userId } = data;
    console.log(`📨 Forwarding WebRTC answer from ${userId} to ${targetUserId}`);
    
    this.sendToUser(targetUserId, {
      type: 'webrtc_answer',
      answer,
      callId,
      fromUserId: userId
    });
  }

  handleICECandidate(data) {
    const { targetUserId, candidate, callId, userId } = data;
    
    this.sendToUser(targetUserId, {
      type: 'webrtc_ice_candidate',
      candidate,
      callId,
      fromUserId: userId
    });
  }

  handleEndCall(data) {
    const { targetUserId, callId, userId } = data;
    console.log(`📞 Forwarding end call from ${userId} to ${targetUserId}`);
    
    this.sendToUser(targetUserId, {
      type: 'webrtc_end_call',
      callId,
      fromUserId: userId
    });
  }

  handleCallNotification(data) {
    const { targetUserId, callId, callerId, callerName } = data;
    console.log(`🔔 Sending call notification to ${targetUserId} from ${callerId}`);
    
    this.sendToUser(targetUserId, {
      type: 'call_notification',
      callId,
      callerId,
      callerName,
      timestamp: new Date().toISOString()
    });
  }

  sendToUser(userId, message) {
    const userWs = this.connectedUsers.get(userId);
    if (userWs && userWs.readyState === WebSocket.OPEN) {
      userWs.send(JSON.stringify(message));
      console.log(`📤 Sent ${message.type} to user ${userId}`);
      return true;
    } else {
      console.log(`❌ User ${userId} not connected or WebSocket not open`);
      return false;
    }
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }
}

module.exports = WebSocketServer;