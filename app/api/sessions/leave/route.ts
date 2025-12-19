import { NextRequest, NextResponse } from 'next/server';
import getRedisClient, { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';

export async function POST(request: NextRequest) {
  try {
    const { code, username } = await request.json();

    if (!code?.trim() || !username?.trim()) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session code and username are required'
      }, { status: 400 });
    }

    const sessionCode = code.trim().toUpperCase();
    const trimmedUsername = username.trim();

    // Track if session should be deleted
    let shouldDelete = false;

    const updatedSession = await atomicSessionUpdate(
      sessionCode,
      SESSION_CONFIG.TTL_SECONDS,
      (session: Session) => {
        // Remove participant from session
        session.participants = session.participants.filter(p => p.username !== trimmedUsername);

        // If no participants left, mark for deletion
        if (session.participants.length === 0) {
          shouldDelete = true;
          return null; // Don't save, we'll delete instead
        }

        return session;
      }
    );

    // Handle deletion case
    if (shouldDelete) {
      const redis = getRedisClient();
      await redis.del(`session:${sessionCode}`);
    } else if (updatedSession) {
      // Publish update to SSE clients
      await publishSessionUpdate(sessionCode, updatedSession);
    }
    // If updatedSession is null and !shouldDelete, session didn't exist - that's fine

    return NextResponse.json<SessionResponse>({
      success: true
    });

  } catch (error) {
    console.error('Leave session error:', error);
    return NextResponse.json<SessionResponse>({
      success: false,
      error: 'Failed to leave session'
    }, { status: 500 });
  }
} 