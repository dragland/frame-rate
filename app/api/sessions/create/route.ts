import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, CreateSessionRequest, SessionResponse } from '../../../../lib/types';
import { validateLetterboxdProfile } from '../../../../lib/letterboxd-server';
import { SESSION_CONFIG } from '../../../../lib/constants';

const generateSessionCode = (): string => {
  let result = '';
  for (let i = 0; i < SESSION_CONFIG.CODE_LENGTH; i++) {
    result += SESSION_CONFIG.CODE_CHARS.charAt(Math.floor(Math.random() * SESSION_CONFIG.CODE_CHARS.length));
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
      if (attempts > SESSION_CONFIG.MAX_CODE_GENERATION_ATTEMPTS) {
        throw new Error('Failed to generate unique session code');
      }
    } while (await redis.exists(`session:${code}`));
    
    // Validate Letterboxd profile
    const profile = await validateLetterboxdProfile(username.trim());
    
    const now = new Date();
    const session: Session = {
      code,
      host: username.trim(),
      participants: [{
        username: username.trim(),
        movies: [],
        joinedAt: now,
        profilePicture: profile.profilePicture,
        letterboxdExists: profile.exists,
      }],
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_CONFIG.TTL_MS),
      isVotingOpen: false,
      maxParticipants: SESSION_CONFIG.MAX_PARTICIPANTS,
      votingPhase: 'ranking',
    };

    // Store session in Redis with TTL
    await redis.setex(
      `session:${code}`,
      SESSION_CONFIG.TTL_SECONDS,
      JSON.stringify(session)
    );

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