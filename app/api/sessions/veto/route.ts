import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, VetoMovieRequest, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';
import { calculateRankedChoiceWinner, getRemainingMovies } from '../../../../lib/voting';

export async function POST(request: NextRequest) {
  try {
    const { code, username, movieId, nominationId }: VetoMovieRequest = await request.json();

    if (!code?.trim() || !username?.trim() || !movieId) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Code, username, and movieId are required'
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
        if (session.votingPhase !== 'locked' && session.votingPhase !== 'vetoing') {
          validationError = 'Not in voting phase';
          return null;
        }

        // Update voting phase to vetoing if this is the first veto
        if (session.votingPhase === 'locked') {
          session.votingPhase = 'vetoing';
        }

        // Record the veto
        participant.vetoedMovieId = movieId;
        if (nominationId) {
          participant.vetoedNominationId = nominationId;
        }
        participant.hasVoted = true;

        // Check if everyone has vetoed
        const allVetoed = session.participants.every(p => p.hasVoted);

        if (allVetoed) {
          // Check if only one movie remains after vetoes
          const remainingMovies = getRemainingMovies(session);

          if (remainingMovies.length <= 1) {
            // Skip directly to results - there's only one movie left
            session.votingPhase = 'results';
            session.votingResults = calculateRankedChoiceWinner(session);
          } else {
            // Transition to final ranking phase
            session.votingPhase = 'finalRanking';

            // Reset finalMovies for all participants
            session.participants.forEach(p => {
              p.finalMovies = undefined;
            });
          }
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
    console.error('Veto movie error:', error);
    return NextResponse.json<SessionResponse>({
      success: false,
      error: 'Failed to veto movie'
    }, { status: 500 });
  }
} 