import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, SessionResponse } from '../../../../lib/types';
import { SESSION_CONFIG } from '../../../../lib/constants';

export async function POST(request: NextRequest) {
  try {
    const { code, username } = await request.json();
    
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
      // Session doesn't exist, but that's okay - they've "left" successfully
      return NextResponse.json<SessionResponse>({ 
        success: true 
      });
    }
    
    const session: Session = JSON.parse(sessionData);
    
    // Remove participant from session
    const originalParticipantCount = session.participants.length;
    session.participants = session.participants.filter(p => p.username !== username.trim());
    
    // If no participants left, delete the session
    if (session.participants.length === 0) {
      await redis.del(sessionKey);
    } else {
      // Update session in Redis
      await redis.setex(
        sessionKey,
        SESSION_CONFIG.TTL_SECONDS,
        JSON.stringify(session)
      );
    }
    
    return NextResponse.json<SessionResponse>({ 
      success: true 
    });
    
  } catch (error) {
    console.error('Leave session error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to leave session' 
    }, { status: 500 });
  }
} 