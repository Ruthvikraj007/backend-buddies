import express from "express";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";

const router = express.Router();

// Add CORS headers to all friend routes
router.use((req, res, next) => {
  const allowedOrigins = [
    "http://localhost:3001",
    "http://localhost:5173", 
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://192.168.0.195:3001"
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Requested-With');
  next();
});

// Handle preflight requests for all routes
router.options('*', (req, res) => {
  const allowedOrigins = [
    "http://localhost:3001",
    "http://localhost:5173", 
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://192.168.0.195:3001"
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Requested-With');
  res.status(200).send();
});

// Get friends list (REAL data, not mock)
router.get("/", async (req, res) => {
  try {
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Current User ID is required"
      });
    }

    // Get actual user with populated friends
    const user = await User.findById(currentUserId).populate('friends', 'username email userType avatar isOnline lastSeen');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    console.log(`📞 Found ${user.friends.length} friends for user ${currentUserId}`);
    
    res.json({
      success: true,
      friends: user.friends
    });
  } catch (error) {
    console.error("Get friends error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get friends"
    });
  }
});

// Get pending friend requests
router.get("/requests", async (req, res) => {
  try {
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Current User ID is required"
      });
    }

    // Get actual pending requests from database
    const receivedRequests = await FriendRequest.find({
      toUser: currentUserId,
      status: 'pending'
    }).populate('fromUser', 'username email userType avatar isOnline lastSeen');

    console.log(`📥 Found ${receivedRequests.length} pending requests for user ${currentUserId}`);

    // Return the requests with proper structure for frontend
    const formattedRequests = receivedRequests.map(req => ({
      _id: req._id,
      fromUser: {
        _id: req.fromUser._id,
        username: req.fromUser.username,
        email: req.fromUser.email,
        userType: req.fromUser.userType,
        avatar: req.fromUser.avatar,
        isOnline: req.fromUser.isOnline,
        lastSeen: req.fromUser.lastSeen
      },
      toUser: req.toUser,
      status: req.status,
      createdAt: req.createdAt
    }));

    res.json({
      success: true,
      requests: formattedRequests
    });

  } catch (error) {
    console.error("Get friend requests error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get friend requests"
    });
  }
});

// Send friend request
router.post("/requests/send", async (req, res) => {
  try {
    const { userId, currentUserId } = req.body;

    if (!userId || !currentUserId) {
      return res.status(400).json({
        success: false,
        error: "User ID and Current User ID are required"
      });
    }

    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Check if current user exists
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: "Current user not found"
      });
    }

    // Check if trying to add self
    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        error: "You cannot send a friend request to yourself"
      });
    }

    // Check if already friends
    const isAlreadyFriend = currentUser.friends.includes(userId);
    if (isAlreadyFriend) {
      return res.status(400).json({
        success: false,
        error: `You are already friends with ${targetUser.username}`
      });
    }

    // Check if request already exists
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { fromUser: currentUserId, toUser: userId },
        { fromUser: userId, toUser: currentUserId }
      ],
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        error: existingRequest.fromUser.toString() === currentUserId 
          ? `Friend request already sent to ${targetUser.username}`
          : `${targetUser.username} has already sent you a friend request`
      });
    }

    // Create new friend request
    const friendRequest = new FriendRequest({
      fromUser: currentUserId,
      toUser: userId,
      status: 'pending'
    });

    await friendRequest.save();

    // Populate the request with user data
    await friendRequest.populate('fromUser', 'username avatar userType email isOnline lastSeen');

    // REAL-TIME NOTIFICATION: Emit socket event to the recipient
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    
    if (io && connectedUsers) {
      const recipientSocketId = connectedUsers.get(userId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('new_friend_request', {
          requestId: friendRequest._id,
          fromUser: {
            id: currentUser._id,
            username: currentUser.username,
            email: currentUser.email,
            userType: currentUser.userType,
            avatar: currentUser.avatar,
            isOnline: currentUser.isOnline,
            lastSeen: currentUser.lastSeen
          },
          timestamp: new Date().toISOString()
        });
        console.log(`📬 Real-time notification sent to ${targetUser.username}`);
      } else {
        console.log(`⚠️ User ${targetUser.username} is offline, will see request when they come online`);
      }
    }

    res.status(201).json({
      success: true,
      message: `Friend request sent to ${targetUser.username}`,
      request: {
        id: friendRequest._id,
        fromUser: friendRequest.fromUser,
        toUser: userId,
        status: friendRequest.status,
        sentAt: friendRequest.createdAt
      }
    });

  } catch (error) {
    console.error("Send friend request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to send friend request"
    });
  }
});

// Accept friend request
router.post("/requests/accept", async (req, res) => {
  try {
    const { requestId, currentUserId } = req.body;

    if (!requestId || !currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Request ID and Current User ID are required"
      });
    }

    // Find the friend request
    const friendRequest = await FriendRequest.findById(requestId)
      .populate('fromUser', 'username friends email userType avatar isOnline lastSeen')
      .populate('toUser', 'username friends email userType avatar isOnline lastSeen');

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        error: "Friend request not found"
      });
    }

    // Verify the current user is the recipient
    if (friendRequest.toUser._id.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: "You can only accept friend requests sent to you"
      });
    }

    // Update request status
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Add to both users' friend lists
    const fromUser = await User.findById(friendRequest.fromUser._id);
    const toUser = await User.findById(friendRequest.toUser._id);

    if (!fromUser.friends.includes(toUser._id)) {
      fromUser.friends.push(toUser._id);
      await fromUser.save();
    }

    if (!toUser.friends.includes(fromUser._id)) {
      toUser.friends.push(fromUser._id);
      await toUser.save();
    }

    // REAL-TIME NOTIFICATION: Notify the sender that their request was accepted
    const io = req.app.get('io');
    const connectedUsers = req.app.get('connectedUsers');
    
    if (io && connectedUsers) {
      const senderSocketId = connectedUsers.get(fromUser._id.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit('friend_request_accepted', {
          requestId: friendRequest._id,
          newFriend: {
            id: toUser._id,
            username: toUser.username,
            email: toUser.email,
            userType: toUser.userType,
            avatar: toUser.avatar,
            isOnline: toUser.isOnline,
            lastSeen: toUser.lastSeen
          },
          timestamp: new Date().toISOString()
        });
        console.log(`📬 Notified ${fromUser.username} that ${toUser.username} accepted their friend request`);
      }
    }

    res.json({
      success: true,
      message: `You are now friends with ${fromUser.username}`,
      newFriend: {
        id: fromUser._id,
        username: fromUser.username,
        email: fromUser.email,
        userType: fromUser.userType,
        avatar: fromUser.avatar,
        isOnline: fromUser.isOnline,
        lastSeen: fromUser.lastSeen
      }
    });

  } catch (error) {
    console.error("Accept friend request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to accept friend request"
    });
  }
});

// Reject friend request
router.post("/requests/reject", async (req, res) => {
  try {
    const { requestId, currentUserId } = req.body;

    if (!requestId || !currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Request ID and Current User ID are required"
      });
    }

    // Find the friend request
    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        error: "Friend request not found"
      });
    }

    // Verify the current user is the recipient
    if (friendRequest.toUser.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: "You can only reject friend requests sent to you"
      });
    }

    // Update request status to rejected
    friendRequest.status = 'rejected';
    await friendRequest.save();

    res.json({
      success: true,
      message: "Friend request rejected"
    });

  } catch (error) {
    console.error("Reject friend request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to reject friend request"
    });
  }
});

// Get received friend requests
router.get("/requests/received", async (req, res) => {
  try {
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Current User ID is required"
      });
    }

    const receivedRequests = await FriendRequest.find({
      toUser: currentUserId,
      status: 'pending'
    }).populate('fromUser', 'username email userType avatar isOnline lastSeen');

    res.json({
      success: true,
      requests: receivedRequests.map(req => ({
        id: req._id,
        username: req.fromUser.username,
        email: req.fromUser.email,
        userType: req.fromUser.userType,
        avatar: req.fromUser.avatar,
        isOnline: req.fromUser.isOnline,
        lastSeen: req.fromUser.lastSeen,
        sentAt: req.createdAt,
        status: req.status
      }))
    });

  } catch (error) {
    console.error("Get received requests error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get received requests"
    });
  }
});

// Get sent friend requests
router.get("/requests/sent", async (req, res) => {
  try {
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Current User ID is required"
      });
    }

    const sentRequests = await FriendRequest.find({
      fromUser: currentUserId,
      status: 'pending'
    }).populate('toUser', 'username email userType avatar isOnline lastSeen');

    res.json({
      success: true,
      requests: sentRequests.map(req => ({
        id: req._id,
        username: req.toUser.username,
        email: req.toUser.email,
        userType: req.toUser.userType,
        avatar: req.toUser.avatar,
        isOnline: req.toUser.isOnline,
        lastSeen: req.toUser.lastSeen,
        sentAt: req.createdAt,
        status: req.status
      }))
    });

  } catch (error) {
    console.error("Get sent requests error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get sent requests"
    });
  }
});

// Cancel sent friend request
router.post("/requests/cancel", async (req, res) => {
  try {
    const { requestId, currentUserId } = req.body;

    if (!requestId || !currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Request ID and Current User ID are required"
      });
    }

    // Find the friend request
    const friendRequest = await FriendRequest.findById(requestId);

    if (!friendRequest) {
      return res.status(404).json({
        success: false,
        error: "Friend request not found"
      });
    }

    // Verify the current user is the sender
    if (friendRequest.fromUser.toString() !== currentUserId) {
      return res.status(403).json({
        success: false,
        error: "You can only cancel friend requests you sent"
      });
    }

    // Delete the request
    await FriendRequest.findByIdAndDelete(requestId);

    res.json({
      success: true,
      message: "Friend request cancelled"
    });

  } catch (error) {
    console.error("Cancel friend request error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to cancel friend request"
    });
  }
});

// Remove friend
router.post("/remove", async (req, res) => {
  try {
    const { friendId, currentUserId } = req.body;

    if (!friendId || !currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Friend ID and Current User ID are required"
      });
    }

    // Remove friend from both users
    await User.findByIdAndUpdate(currentUserId, {
      $pull: { friends: friendId }
    });

    await User.findByIdAndUpdate(friendId, {
      $pull: { friends: currentUserId }
    });

    // Also delete any pending friend requests between them
    await FriendRequest.deleteMany({
      $or: [
        { fromUser: currentUserId, toUser: friendId },
        { fromUser: friendId, toUser: currentUserId }
      ]
    });

    res.json({
      success: true,
      message: "Friend removed successfully"
    });

  } catch (error) {
    console.error("Remove friend error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove friend"
    });
  }
});

// Get friend suggestions
router.get("/suggestions", async (req, res) => {
  try {
    const { currentUserId } = req.query;

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        error: "Current User ID is required"
      });
    }

    // Get current user's friends
    const currentUser = await User.findById(currentUserId).populate('friends');
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    const friendIds = currentUser.friends.map(friend => friend._id);
    friendIds.push(currentUserId); // Exclude self

    // Get random users who are not friends
    const suggestions = await User.aggregate([
      { $match: { _id: { $nin: friendIds } } },
      { $sample: { size: 5 } },
      { $project: { username: 1, email: 1, userType: 1, avatar: 1, isOnline: 1, lastSeen: 1 } }
    ]);

    res.json({
      success: true,
      suggestions
    });

  } catch (error) {
    console.error("Get friend suggestions error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get friend suggestions"
    });
  }
});

// Health check for friends route
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Friends API is working",
    timestamp: new Date().toISOString(),
    endpoints: {
      getFriends: "GET /api/friends?currentUserId=USER_ID",
      getFriendRequests: "GET /api/friends/requests?currentUserId=USER_ID",
      sendFriendRequest: "POST /api/friends/requests/send",
      acceptFriendRequest: "POST /api/friends/requests/accept",
      rejectFriendRequest: "POST /api/friends/requests/reject",
      cancelFriendRequest: "POST /api/friends/requests/cancel",
      removeFriend: "POST /api/friends/remove"
    }
  });
});

export default router;