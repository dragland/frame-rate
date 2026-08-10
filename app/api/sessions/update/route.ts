import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, UpdateMoviesRequest, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';
import { hasDuplicateMovieIds } from '../../../../lib/voting';
import { isMovieArrayPayload, isValidSessionCode, isValidUsername, normalizeSessionCode, normalizeUsername } from '../../../../lib/validation';

export async function PUT(request: NextRequest) {
  try {
    const { code, username, movies }: UpdateMoviesRequest = await request.json();

    if (!code?.trim() || !username?.trim()) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session code and username are required'
      }, { status: 400 });
    }

    if (!isValidSessionCode(code) || !isValidUsername(username) || !isMovieArrayPayload(movies)) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Invalid session code, username, or movie list'
      }, { status: 400 });
    }

    if (hasDuplicateMovieIds(movies)) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Movie list cannot contain duplicates'
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
        // Prevent updates if voting is locked
        if (session.votingPhase !== 'ranking') {
          validationError = 'Cannot update movies during voting process';
          return null;
        }

        // Find participant
        const participant = session.participants.find(
          p => p.username === trimmedUsername
        );

        if (!participant) {
          validationError = 'Participant not found in session';
          return null;
        }

        // Update participant's movies
        participant.movies = movies;

        return session;
      }
    );

    if (!updatedSession) {
      if (validationError) {
        const status = validationError === 'Participant not found in session' ? 404 : 400;
        return NextResponse.json<SessionResponse>({
          success: false,
          error: validationError
        }, { status });
      }
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session not found or expired'
      }, { status: 404 });
    }

    // Publish update to SSE clients
    await publishSessionUpdate(sessionCode, updatedSession);

    return NextResponse.json<SessionResponse>({
      success: true,
      session: updatedSession
    });

  } catch (error) {
    console.error('Update movies error:', error);
    return NextResponse.json<SessionResponse>({
      success: false,
      error: 'Failed to update movies'
    }, { status: 500 });
  }
} 
