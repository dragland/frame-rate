import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, StartVotingRequest, SessionResponse } from '../../../../lib/types';
import { canStartVoting } from '../../../../lib/voting';

export async function POST(request: NextRequest) {
  try {
    const { code, username }: StartVotingRequest = await request.json();
    
    if (!code?.trim() || !username?.trim()) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Code and username are required' 
      }, { status: 400 });
    }
    
    const redis = getRedisClient();
    const sessionData = await redis.get(`session:${code.trim().toUpperCase()}`);
    
    if (!sessionData) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Session not found' 
      }, { status: 404 });
    }
    
    const session: Session = JSON.parse(sessionData);
    
    // Check if user is in session
    const participant = session.participants.find(p => p.username === username.trim());
    if (!participant) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'User not in session' 
      }, { status: 403 });
    }
    
    // Check if voting can start
    if (!canStartVoting(session)) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'All participants need at least 2 movies to start voting' 
      }, { status: 400 });
    }
    
    // Update session to vetoing phase (skip locked phase)
    session.votingPhase = 'vetoing';
    session.isVotingOpen = true;
    
    // Reset veto status and final rankings
    session.participants.forEach(p => {
      p.hasVoted = false;
      p.vetoedMovieId = undefined;
      p.finalMovies = undefined;
    });
    
    await redis.setex(
      `session:${code.trim().toUpperCase()}`, 
      24 * 60 * 60, 
      JSON.stringify(session)
    );
    
    console.log(`🗳️ Started voting for session ${code} by ${username}`);
    
    return NextResponse.json<SessionResponse>({ 
      success: true, 
      session 
    });
    
  } catch (error) {
    console.error('Start voting error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to start voting' 
    }, { status: 500 });
  }
} 