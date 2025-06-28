import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, JoinSessionRequest, SessionResponse } from '../../../../lib/types';

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
      console.log(`❌ Session ${code} not found`);
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
      console.log(`🔄 ${trimmedUsername} rejoined session ${code}`);
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

    // Add new participant
    session.participants.push({
      username: trimmedUsername,
      movies: [],
      joinedAt: new Date(),
    });
    
    // Update session in Redis
    await redis.setex(
      sessionKey,
      24 * 60 * 60, // Reset TTL
      JSON.stringify(session)
    );
    
    console.log(`🎉 ${trimmedUsername} joined session ${code}`);
    
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