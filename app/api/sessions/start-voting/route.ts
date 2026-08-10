import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, StartVotingRequest, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';
import { canStartVoting, lockNominations } from '../../../../lib/voting';
import { isValidSessionCode, isValidUsername, normalizeSessionCode, normalizeUsername } from '../../../../lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { code, username }: StartVotingRequest = await request.json();

    if (!code?.trim() || !username?.trim()) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Code and username are required'
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

    // Track validation errors from inside the atomic modifier
    let validationError: string | null = null;

    const updatedSession = await atomicSessionUpdate(
      sessionCode,
      SESSION_CONFIG.TTL_SECONDS,
      (session: Session) => {
        // Check if user is in session
        const participant = session.participants.find(p => p.username === trimmedUsername);
        if (!participant) {
          validationError = 'User not in session';
          return null;
        }

        if (session.votingPhase !== 'ranking') {
          validationError = 'Voting has already started';
          return null;
        }

        // Check if voting can start (validates with latest data)
        if (!canStartVoting(session)) {
          validationError = 'All participants need at least 2 movies to start voting';
          return null;
        }

        // Freeze the nomination pool and move into the veto phase
        lockNominations(session);
        session.votingPhase = 'vetoing';
        session.isVotingOpen = true;

        return session;
      }
    );

    if (!updatedSession) {
      if (validationError) {
        const status = validationError === 'User not in session' ? 403 : 400;
        return NextResponse.json<SessionResponse>({
          success: false,
          error: validationError
        }, { status });
      }
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session not found'
      }, { status: 404 });
    }

    // Publish update to SSE clients
    await publishSessionUpdate(sessionCode, updatedSession);

    return NextResponse.json<SessionResponse>({
      success: true,
      session: updatedSession
    });

  } catch (error) {
    console.error('Start voting error:', error);
    return NextResponse.json<SessionResponse>({
      success: false,
      error: 'Failed to start voting'
    }, { status: 500 });
  }
} 
