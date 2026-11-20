import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export interface AppUser {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  role: string;
  onboardingCompleted: boolean;
}

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  appUser?: AppUser;
}

export async function getOrCreateUser(uid: string, email: string, fullName?: string): Promise<AppUser> {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        fullName: fullName || email.split('@')[0] || 'Shop Owner',
        role: 'owner',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    const row = result[0];
    return {
      id: row.id,
      uid: row.uid,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      onboardingCompleted: row.onboardingCompleted,
    };
  } catch (error) {
    console.error('Failed to sync user in database:', error);
    throw new Error('Unable to synchronize user profile.', { cause: error });
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decoded;
    req.appUser = await getOrCreateUser(
      decoded.uid,
      decoded.email || 'user@shwesolar.mm',
      decoded.name
    );
    next();
  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};
