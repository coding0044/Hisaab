import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { PublicMember } from '../types/index.ts';

export const SESSION_COOKIE_NAME = 'fh_session';
const BCRYPT_ROUNDS = 12;

// Ephemeral fallback secret for local development only if AUTH_SECRET isn't provided
const DEV_FALLBACK_SECRET = crypto
  .createHash('sha256')
  .update(`friends_hisaab_dev_${process.cwd()}`)
  .digest('hex');

function getAuthSecret(): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    DEV_FALLBACK_SECRET;
  return secret;
}

export interface SessionPayload {
  sub: string;
  email: string;
  full_name: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: PublicMember;
  session?: SessionPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSessionToken(
  user: Pick<PublicMember, 'id' | 'email' | 'full_name'>,
  rememberMe = false
): string {
  const expiresInSeconds = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      full_name: user.full_name,
    },
    getAuthSecret(),
    { expiresIn: expiresInSeconds }
  );
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getAuthSecret());
    if (typeof decoded === 'string' || !decoded.sub) return null;
    return decoded as SessionPayload;
  } catch {
    return null;
  }
}

function isHttpsRequest(req: Request): boolean {
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') {
    return true;
  }
  return Boolean(req.secure);
}

export function setSessionCookie(
  req: Request,
  res: Response,
  token: string,
  rememberMe = false
): void {
  const maxAgeMs = (rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60) * 1000;
  const https = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookie(req: Request, res: Response): void {
  const https = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
  });
}

// In-memory sliding window rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 15;
  const record = loginAttempts.get(key);

  if (!record || record.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (record.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetLoginRateLimit(key: string): void {
  loginAttempts.delete(key);
}

/**
 * Basic CSRF/Origin protection for state-changing requests.
 */
export function verifySameOriginMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const requestedWith = req.headers['x-requested-with'];
  const contentType = req.headers['content-type'] ?? '';
  if (requestedWith === 'XMLHttpRequest' || contentType.includes('application/json')) {
    next();
    return;
  }

  res.status(403).json({ error: 'Invalid request origin or content type.' });
}
