import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, UpdateMoviesRequest, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';

export async function PUT(request: NextRequest) {
  try {
    const { code, username, movies }: UpdateMoviesRequest = await request.json();
    
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
    
    // Prevent updates if voting is locked
    if (session.votingPhase !== 'ranking') {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Cannot update movies during voting process' 
      }, { status: 400 });
    }
    
    // Find participant
    const participantIndex = session.participants.findIndex(
      p => p.username === username.trim()
    );
    
    if (participantIndex === -1) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Participant not found in session' 
      }, { status: 404 });
    }
    
    // Update participant's movies
    session.participants[participantIndex].movies = movies || [];
    
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
    console.error('Update movies error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to update movies' 
    }, { status: 500 });
  }
} 