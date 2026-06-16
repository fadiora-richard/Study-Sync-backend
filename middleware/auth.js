import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;

export const auth = async (req, res, next) => {
  try {
    let token = req.query.token;
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return res.status(401).json({ message: 'No token provided' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ message: 'Invalid token' });
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error', err); 
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

export const requireRole = (roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'No user' });
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  if (allowedRoles.includes(req.user.role) || req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Forbidden' });
};