import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';
import { advanceVotingPhaseIfComplete } from '../../../../lib/voting';
import { isValidSessionCode, isValidUsername, normalizeSessionCode, normalizeUsername } from '../../../../lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { code, username } = await request.json();

    if (!code?.trim() || !username?.trim()) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session code and username are required'
      }, { status: 400 });
    }

    if (!isValidSessionCode(code) || !isValidUsername(username)) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Invalid session code or username'
      }, { status: 400 });
    }

    const sessionCode = normalizeSessionCode(code);
    const trimmedUsername = normalizeUsername(username);

    const updatedSession = await atomicSessionUpdate(
      sessionCode,
      SESSION_CONFIG.TTL_SECONDS,
      (session: Session): Session | null | 'delete' => {
        const originalLength = session.participants.length;

        // Remove participant from session
        session.participants = session.participants.filter(
          p => p.username !== trimmedUsername
        );

        if (session.participants.length === originalLength) {
          return null; // Not a member — skip the write and SSE broadcast
        }

        // If no participants left, delete the session (inside the optimistic
        // lock, so a concurrent join retries instead of being wiped out)
        if (session.participants.length === 0) {
          return 'delete';
        }

        if (!session.participants.some(p => p.username === session.host)) {
          session.host = session.participants[0].username;
        }

        // A departure can change the remaining pool and/or make the departing
        // user the last blocker — re-check the phase transition.
        advanceVotingPhaseIfComplete(session);

        return session;
      }
    );

    if (updatedSession && updatedSession !== 'deleted') {
      // Publish update to SSE clients
      await publishSessionUpdate(sessionCode, updatedSession);
    }
    // null means the session didn't exist or the user wasn't a member - that's fine;
    // 'deleted' means the last participant left and the session was removed

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
