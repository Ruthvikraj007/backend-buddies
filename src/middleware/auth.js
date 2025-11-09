import jwt from 'jsonwebtoken';

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    console.log('🔐 No token provided');
    return res.status(401).json({ 
      success: false, 
      error: 'Access token required' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
    // Normalize token payloads: some tokens use { userId }, others { id } or {_id}
    const normalizedId = decoded.userId || decoded.id || decoded._id;
    req.user = { ...decoded, id: normalizedId };
    console.log('🔐 Token verified for user (normalized id):', normalizedId);
    next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    return res.status(403).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

export const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key');
      req.user = decoded;
      console.log('🔐 Optional auth - User:', decoded.id);
    } catch (error) {
      console.log('⚠️ Optional auth - Invalid token:', error.message);
      // Continue without user
    }
  } else {
    console.log('🔐 Optional auth - No token provided');
  }
  
  next();
};