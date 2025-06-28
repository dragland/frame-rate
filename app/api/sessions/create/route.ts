import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, CreateSessionRequest, SessionResponse } from '../../../../lib/types';

const generateSessionCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export async function POST(request: NextRequest) {
  try {
    const { username }: CreateSessionRequest = await request.json();
    
    if (!username?.trim()) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Username is required' 
      }, { status: 400 });
    }
    
    const redis = getRedisClient();
    
    // Generate unique session code
    let code: string;
    let attempts = 0;
    do {
      code = generateSessionCode();
      attempts++;
      if (attempts > 10) {
        throw new Error('Failed to generate unique session code');
      }
    } while (await redis.exists(`session:${code}`));
    
    const now = new Date();
    const session: Session = {
      code,
      host: username.trim(),
      participants: [{
        username: username.trim(),
        movies: [],
        joinedAt: now,
      }],
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours
      isVotingOpen: false,
      maxParticipants: 8,
      votingPhase: 'ranking',
    };
    
    // Store session in Redis with TTL
    await redis.setex(
      `session:${code}`, 
      24 * 60 * 60, // 24 hours TTL
      JSON.stringify(session)
    );
    
    console.log(`✅ Created session ${code} for user ${username.trim()}`);
    
    return NextResponse.json<SessionResponse>({ 
      success: true, 
      session 
    });
    
  } catch (error) {
    console.error('Create session error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to create session' 
    }, { status: 500 });
  }
} 