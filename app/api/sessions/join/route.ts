import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
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
    
    const redis = getRedisClient();
    const sessionKey = `session:${code.trim().toUpperCase()}`;
    
    // Get existing session
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      return NextResponse.json<SessionResponse>({
        success: false,
        error: 'Session not found or expired'
      }, { status: 404 });
    }
    
    const session: Session = JSON.parse(sessionData);
    
    // Migration: Add votingPhase if missing (for backward compatibility)
    if (!session.votingPhase) {
      session.votingPhase = 'ranking';
    }
    
    const trimmedUsername = username.trim();
    
    // Check if username already exists (allow rejoining)
    const existingParticipant = session.participants.find(p => p.username === trimmedUsername);
    
    if (existingParticipant) {
      // User is rejoining - just return success with existing session
      return NextResponse.json<SessionResponse>({
        success: true,
        session
      });
    }

    // Check if session is full (only for new participants)
    if (session.participants.length >= session.maxParticipants) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Session is full' 
      }, { status: 400 });
    }

    // Validate Letterboxd profile for new participant
    const profile = await validateLetterboxdProfile(trimmedUsername);
    
    // Add new participant
    session.participants.push({
      username: trimmedUsername,
      movies: [],
      joinedAt: new Date(),
      profilePicture: profile.profilePicture,
      letterboxdExists: profile.exists,
    });
    
    // Update session in Redis
    await redis.setex(
      sessionKey,
      SESSION_CONFIG.TTL_SECONDS,
      JSON.stringify(session)
    );

    return NextResponse.json<SessionResponse>({
      success: true,
      session
    });
    
  } catch (error) {
    console.error('Join session error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to join session' 
    }, { status: 500 });
  }
} 