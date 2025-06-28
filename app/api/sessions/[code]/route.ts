import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, SessionResponse } from '../../../../lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  try {
    const { code } = params;
    
    if (!code?.trim()) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Session code is required' 
      }, { status: 400 });
    }
    
    const redis = getRedisClient();
    const sessionKey = `session:${code.trim().toUpperCase()}`;
    
    // Get session data
    const sessionData = await redis.get(sessionKey);
    if (!sessionData) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Session not found or expired' 
      }, { status: 404 });
    }
    
    const session: Session = JSON.parse(sessionData);
    
    return NextResponse.json<SessionResponse>({ 
      success: true, 
      session 
    });
    
  } catch (error) {
    console.error('Get session error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to get session' 
    }, { status: 500 });
  }
} 