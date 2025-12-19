import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, UpdateFinalMoviesRequest, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';
import { calculateRankedChoiceWinner, getRemainingMovies } from '../../../../lib/voting';

export async function POST(request: NextRequest) {
  try {
    const { code, username, movies }: UpdateFinalMoviesRequest = await request.json();

    if (!code?.trim() || !username?.trim() || !Array.isArray(movies)) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Code, username, and movies array are required'
      }, { status: 400 });
    }

    const sessionCode = code.trim().toUpperCase();

    // Track validation errors from inside the atomic modifier
    let validationError: string | null = null;

    const updatedSession = await atomicSessionUpdate(
      sessionCode,
      SESSION_CONFIG.TTL_SECONDS,
      (session: Session) => {
        // Check if user is in session
        const participant = session.participants.find(p => p.username === username.trim());
        if (!participant) {
          validationError = 'User not in session';
          return null;
        }

        // Check if we're in the right phase
        if (session.votingPhase !== 'finalRanking') {
          validationError = 'Not in final ranking phase';
          return null;
        }

        // Validate that movies are from the remaining movies list
        const remainingMovies = getRemainingMovies(session);
        const remainingMovieIds = new Set(remainingMovies.map(m => m.id));
        const invalidMovies = movies.filter(m => !remainingMovieIds.has(m.id));

        if (invalidMovies.length > 0) {
          validationError = 'Invalid movies in final ranking';
          return null;
        }

        // Update participant's final movies
        participant.finalMovies = movies;

        // Check if everyone has completed final rankings
        const allCompleted = session.participants.every(p => p.finalMovies && p.finalMovies.length > 0);

        if (allCompleted) {
          // Calculate final results using final rankings
          session.votingPhase = 'results';
          session.votingResults = calculateRankedChoiceWinner(session);
        }

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