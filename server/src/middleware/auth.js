import { verifyToken } from '../utils/jwt.js';
import { unauthorized, forbidden } from '../utils/httpError.js';
import User from '../models/User.js';
function extractToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.substring(7);
}
export async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized('Authentication required');
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub);
    if (!user || !user.is_active) throw unauthorized('Account deactivated or not found');
    req.user = { userId: user._id.toString(), role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}
export async function optionalAuthenticate(req, res, next) {
  let decoded;
  try {
    const token = extractToken(req);
    if (!token) return next();
    decoded = verifyToken(token);
  } catch {
    // Public endpoints remain available when a stale optional token is present.
    return next();
  }
  try {
    const user = await User.findById(decoded.sub);
    if (user && user.is_active) req.user = { userId: user._id.toString(), role: user.role };
    return next();
  } catch (error) {
    return next(error);
  }
}
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return next(forbidden('Administrator access required'));
  next();
}
