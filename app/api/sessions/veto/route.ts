import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, VetoMovieRequest, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';
import { advanceVotingPhaseIfComplete, findRemainingNomination, hasVetoed } from '../../../../lib/voting';
import { isValidSessionCode, isValidUsername, normalizeSessionCode, normalizeUsername } from '../../../../lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { code, username, nominationId }: VetoMovieRequest = await request.json();

    if (!code?.trim() || !username?.trim() || !nominationId?.trim()) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Code, username, and nominationId are required'
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
    const trimmedNominationId = nominationId.trim();

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

        // Check if we're in the right phase
        if (session.votingPhase !== 'vetoing') {
          validationError = 'Not in voting phase';
          return null;
        }

        if (hasVetoed(session, trimmedUsername)) {
          validationError = 'User has already vetoed';
          return null;
        }

        const nomination = findRemainingNomination(session, trimmedNominationId);
        if (!nomination) {
          validationError = 'Invalid or already vetoed nomination';
          return null;
        }

        // Record the veto on the session so leaving/rejoining can't reset it
        session.vetoes[trimmedUsername] = nomination.nominationId;

        advanceVotingPhaseIfComplete(session);

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
    console.error('Veto movie error:', error);
    return NextResponse.json<SessionResponse>({
      success: false,
      error: 'Failed to veto movie'
    }, { status: 500 });
  }
} 
