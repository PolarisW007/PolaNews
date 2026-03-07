import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { query, queryOne } from './db/schema';
import { v4 as uuidv4 } from 'uuid';
import type { User, UserPreferences } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'worldoverview-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

export async function getCurrentUser(req: NextRequest): Promise<User | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;

  const row = await queryOne('SELECT * FROM users WHERE id = $1', [payload.userId]);
  if (!row) return null;

  return {
    id: row.id as string,
    email: row.email as string,
    display_name: (row.display_name as string) || '',
    avatar_url: (row.avatar_url as string) || '',
    preferences: (row.preferences as User['preferences']) || { language: 'zh', theme: 'dark', digest_time: ['08:00'], categories: [] },
    created_at: (row.created_at as Date)?.toISOString() || '',
    last_login_at: (row.last_login_at as Date)?.toISOString() || '',
  };
}

export async function createUser(email: string, password: string, displayName: string): Promise<User> {
  const id = uuidv4();
  const passwordHash = hashPassword(password);
  const preferences: UserPreferences = { language: 'zh', theme: 'dark', digest_time: ['08:00'], categories: [] };

  await query(
    'INSERT INTO users (id, email, password_hash, display_name, preferences) VALUES ($1, $2, $3, $4, $5)',
    [id, email, passwordHash, displayName, JSON.stringify(preferences)]
  );

  return {
    id,
    email,
    display_name: displayName,
    avatar_url: '',
    preferences,
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  };
}

export async function loginUser(email: string, password: string): Promise<{ user: User; token: string } | null> {
  const row = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
  if (!row) return null;

  if (!verifyPassword(password, row.password_hash as string)) return null;

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.id]);

  const token = generateToken(row.id as string);
  return {
    user: {
      id: row.id as string,
      email: row.email as string,
      display_name: (row.display_name as string) || '',
      avatar_url: (row.avatar_url as string) || '',
      preferences: (row.preferences as User['preferences']) || { language: 'zh', theme: 'dark', digest_time: ['08:00'], categories: [] },
      created_at: (row.created_at as Date)?.toISOString() || '',
      last_login_at: new Date().toISOString(),
    },
    token,
  };
}
