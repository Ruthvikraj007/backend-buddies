import express from "express";
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import User from "../models/User.js";

const router = express.Router();

// Helper to produce absolute avatar URLs based on request or BACKEND_URL env
const makeAbsoluteAvatar = (req, avatarPath) => {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) return avatarPath;
  if (process.env.BACKEND_URL) return `${process.env.BACKEND_URL}${avatarPath}`;
  return `${req.protocol}://${req.get('host')}${avatarPath}`;
};

// Multer storage for avatar uploads
const avatarsDir = path.join(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(avatarsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, avatarsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = `${req.user?.id || 'anon'}-${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Search users
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Search query is required"
      });
    }

    const users = await User.find({
      username: { $regex: q, $options: "i" }
    }).select("username email userType avatar isOnline lastSeen");

    res.json({
      success: true,
      users: users.map(user => ({
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        avatar: makeAbsoluteAvatar(req, user.avatar),
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }))
    });

  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      success: false,
      error: "Search failed"
    });
  }
});

// Get user profile
router.get("/:id", async (req, res) => {
  try {
  const user = await User.findById(req.params.id).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        avatar: makeAbsoluteAvatar(req, user.avatar),
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        bio: user.bio,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get user"
    });
  }
});

// Get all users (for testing)
router.get("/", async (req, res) => {
  try {
    const users = await User.find().select("username email userType avatar isOnline lastSeen");

    res.json({
      success: true,
      users: users.map(user => ({
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        avatar: makeAbsoluteAvatar(req, user.avatar),
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }))
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get users"
    });
  }
});

export default router;

// Upload avatar for current user
router.post('/me/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

  const relativePath = `/uploads/avatars/${req.file.filename}`;
  const avatarUrl = process.env.BACKEND_URL ? `${process.env.BACKEND_URL}${relativePath}` : `${req.protocol}://${req.get('host')}${relativePath}`;

  const userId = req.user.id;
  const user = await User.findByIdAndUpdate(userId, { avatar: avatarUrl }, { new: true }).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, message: 'Avatar updated', user: {
      id: user._id,
      username: user.username,
      email: user.email,
      userType: user.userType,
      avatar: user.avatar,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
      bio: user.bio,
      createdAt: user.createdAt
    }});
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload avatar' });
  }
});