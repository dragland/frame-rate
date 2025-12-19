import { NextRequest, NextResponse } from 'next/server';
import { atomicSessionCreate, publishSessionUpdate } from '@/lib/redis';
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

    const trimmedUsername = username.trim();

    // Validate Letterboxd profile first (before code generation loop)
    const profile = await validateLetterboxdProfile(trimmedUsername);

    // Try to atomically create session with unique code
    let session: Session | null = null;

    for (let attempts = 0; attempts < SESSION_CONFIG.MAX_CODE_GENERATION_ATTEMPTS; attempts++) {
      const code = generateSessionCode();
      const now = new Date();

      const candidateSession: Session = {
        code,
        host: trimmedUsername,
        participants: [{
          username: trimmedUsername,
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

      // Atomically try to create - fails if code already exists
      const created = await atomicSessionCreate(code, candidateSession, SESSION_CONFIG.TTL_SECONDS);

      if (created) {
        session = candidateSession;
        break;
      }
      // Code collision - try another code
    }

    if (!session) {
      throw new Error('Failed to generate unique session code');
    }

    // Publish update to SSE clients
    await publishSessionUpdate(session.code, session);

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