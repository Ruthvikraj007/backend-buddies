import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js"; // Import the User model
import emailService from "../services/emailService.js";

const router = express.Router();

// Helper to produce absolute avatar URLs based on request or BACKEND_URL env
const makeAbsoluteAvatar = (req, avatarPath) => {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) return avatarPath;
  if (process.env.BACKEND_URL) return `${process.env.BACKEND_URL}${avatarPath}`;
  return `${req.protocol}://${req.get('host')}${avatarPath}`;
};

// Register
router.post("/register", async (req, res) => {
  try {
    const { username, email, password, userType } = req.body;

    // Validation
    if (!username || !email || !password || !userType) {
      return res.status(400).json({
        success: false,
        error: "All fields are required"
      });
    }

    // Check if user exists using MongoDB
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "User with this email or username already exists"
      });
    }

    // Generate email verification token
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user using MongoDB (not verified yet)
    const user = new User({
      username,
      email,
      password, // Will be automatically hashed by the User model
      userType,
      isOnline: false, // Set to false until email is verified
      lastSeen: new Date(),
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires
    });

    await user.save();

    // Send verification email
    try {
      await emailService.sendVerificationEmail(email, username, verificationToken);
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Delete user if email fails
      await User.findByIdAndDelete(user._id);
      return res.status(500).json({
        success: false,
        error: "Failed to send verification email. Please check your email address and try again."
      });
    }

    res.status(201).json({
      success: true,
      message: "Registration successful! Please check your email to verify your account.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        isEmailVerified: false,
        avatar: makeAbsoluteAvatar(req, user.avatar)
      }
    });

  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      error: "Registration failed. Please try again."
    });
  }
});

// Verify Email
router.get("/verify-email/:token", async (req, res) => {
  try {
    const { token } = req.params;

    // Find user with this verification token
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired verification token"
      });
    }

    // Update user as verified
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    user.isOnline = true;
    await user.save();

    // Send welcome email
    await emailService.sendWelcomeEmail(user.email, user.username);

    // Generate token for auto-login
    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "fallback-secret-key",
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Email verified successfully! You can now login.",
      token: authToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        avatar: makeAbsoluteAvatar(req, user.avatar),
        isOnline: user.isOnline,
        isEmailVerified: true
      }
    });

  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({
      success: false,
      error: "Email verification failed. Please try again."
    });
  }
});

// Resend Verification Email
router.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email is required"
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        error: "Email is already verified"
      });
    }

    // Generate new verification token
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = verificationExpires;
    await user.save();

    // Send verification email
    await emailService.sendVerificationEmail(email, user.username, verificationToken);

    res.status(200).json({
      success: true,
      message: "Verification email sent successfully!"
    });

  } catch (error) {
    console.error("Resend verification error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to resend verification email. Please try again."
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Username and password are required"
      });
    }

    // Find user in MongoDB
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "Invalid username or password"
      });
    }

    // Check password using the model's method
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        error: "Invalid username or password"
      });
    }

    // Check if email is verified
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        error: "Please verify your email before logging in. Check your inbox for the verification link.",
        requiresVerification: true,
        email: user.email
      });
    }

    // Update online status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "fallback-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        userType: user.userType,
        avatar: makeAbsoluteAvatar(req, user.avatar),
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        isEmailVerified: user.isEmailVerified
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      error: "Login failed. Please try again."
    });
  }
});

export default router;