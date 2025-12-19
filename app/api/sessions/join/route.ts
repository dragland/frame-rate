import { NextRequest, NextResponse } from 'next/server';
import getRedisClient, { atomicSessionUpdate, publishSessionUpdate } from '@/lib/redis';
import { Session, JoinSessionRequest, SessionResponse } from '../../../../lib/types';
import { validateLetterboxdProfile } from '../../../../lib/letterboxd-server';
import { SESSION_CONFIG } from '../../../../lib/constants';

export async function POST(request: NextRequest) {
  try {
    const { code, username }: JoinSessionRequest = await request.json();

    if (!code?.trim() || !username?.trim()) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session code and username are required'
      }, { status: 400 });
    }

    const sessionCode = code.trim().toUpperCase();
    const trimmedUsername = username.trim();

    // First check: Is user already in session? (read-only, no race condition concern)
    const redis = getRedisClient();
    const sessionData = await redis.get(`session:${sessionCode}`);

    if (!sessionData) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session not found or expired'
      }, { status: 404 });
    }

    const existingSession: Session = JSON.parse(sessionData);

    // Check if username already exists (allow rejoining)
    const existingParticipant = existingSession.participants.find(p => p.username === trimmedUsername);

    if (existingParticipant) {
      // User is rejoining - just return success with existing session
      return NextResponse.json<SessionResponse>({
        success: true,
        session: existingSession
      });
    }

    // Pre-flight check: is session full? (avoid unnecessary Letterboxd call)
    if (existingSession.participants.length >= existingSession.maxParticipants) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session is full'
      }, { status: 400 });
    }

    // Validate Letterboxd profile BEFORE atomic transaction (external API call)
    const profile = await validateLetterboxdProfile(trimmedUsername);

    // Track validation errors from inside the atomic modifier
    let validationError: string | null = null;

    // Now atomically add the participant
    const updatedSession = await atomicSessionUpdate(
      sessionCode,
      SESSION_CONFIG.TTL_SECONDS,
      (session: Session) => {
        // Migration: Add votingPhase if missing (for backward compatibility)
        if (!session.votingPhase) {
          session.votingPhase = 'ranking';
        }

        // Re-check if user joined while we were validating Letterboxd
        const alreadyJoined = session.participants.find(p => p.username === trimmedUsername);
        if (alreadyJoined) {
          // Return current session as-is (they rejoined via another request)
          return session;
        }

        // Re-check if session became full while we were validating
        if (session.participants.length >= session.maxParticipants) {
          validationError = 'Session is full';
          return null;
        }

        // Add new participant
        session.participants.push({
          username: trimmedUsername,
          movies: [],
          joinedAt: new Date(),
          profilePicture: profile.profilePicture,
          letterboxdExists: profile.exists,
        });

        return session;
      }
    );

    if (!updatedSession) {
      if (validationError) {
        return NextResponse.json<SessionResponse>({
          success: false,
          error: validationError
        }, { status: 400 });
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
    console.error('Join session error:', error);
    return NextResponse.json<SessionResponse>({
      success: false,
      error: 'Failed to join session'
    }, { status: 500 });
  }
} 