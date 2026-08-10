import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, UpdateFinalMoviesRequest, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';
import { advanceVotingPhaseIfComplete, getRemainingMovies, isExactMovieSet, orderMoviesFromCanonicalSet } from '../../../../lib/voting';
import { isMovieArrayPayload, isValidSessionCode, isValidUsername, normalizeSessionCode, normalizeUsername } from '../../../../lib/validation';

export async function POST(request: NextRequest) {
  try {
    const { code, username, movies }: UpdateFinalMoviesRequest = await request.json();

    if (!code?.trim() || !username?.trim() || !Array.isArray(movies)) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Code, username, and movies array are required'
      }, { status: 400 });
    }

    if (!isValidSessionCode(code) || !isValidUsername(username) || !isMovieArrayPayload(movies)) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Invalid session code, username, or movie list'
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

        // Check if we're in the right phase
        if (session.votingPhase !== 'finalRanking') {
          validationError = 'Not in final ranking phase';
          return null;
        }

        if (trimmedUsername in session.finalRankings) {
          validationError = 'Final ranking is already locked';
          return null;
        }

        // Validate that the submitted ranking is exactly the remaining movie set
        const remainingMovies = getRemainingMovies(session);

        if (!isExactMovieSet(movies, remainingMovies)) {
          validationError = 'Final ranking must include every remaining movie exactly once';
          return null;
        }

        // Record the ranking on the session so it survives leaving/rejoining
        session.finalRankings[trimmedUsername] = orderMoviesFromCanonicalSet(movies, remainingMovies);

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
    console.error('Update final movies error:', error);
    return NextResponse.json<SessionResponse>({
      success: false,
      error: 'Failed to update final movies'
    }, { status: 500 });
  }
} 
