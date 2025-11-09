import express from 'express';
import Message from '../models/Message.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all messages for a user
// CHANGED: Removed authenticateToken middleware
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log(`📨 Fetching messages for user: ${userId}`);
    
    const messages = await Message.find({
      $or: [
        { sender: userId },
        { recipient: userId }
      ]
    })
    .populate('sender', 'username')
    .populate('recipient', 'username')
    .sort({ createdAt: 1 });

    console.log(`✅ Found ${messages.length} messages for user ${userId}`);
    
    const formattedMessages = messages.map(msg => ({
      id: msg._id.toString(),
      senderId: msg.sender._id.toString(),
      recipientId: msg.recipient._id.toString(),
      text: msg.content,
      timestamp: msg.createdAt,
      sender: msg.sender._id.toString() === userId ? 'me' : 'them',
      delivered: true,
      read: false
    }));

    res.json({
      success: true,
      messages: formattedMessages
    });
    
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch messages' 
    });
  }
});

export default router;