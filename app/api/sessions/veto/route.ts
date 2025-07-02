import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, VetoMovieRequest, SessionResponse } from '../../../../lib/types';
import { calculateRankedChoiceWinner, getRemainingMovies } from '../../../../lib/voting';

export async function POST(request: NextRequest) {
  try {
    const { code, username, movieId, nominationId }: VetoMovieRequest = await request.json();
    
    if (!code?.trim() || !username?.trim() || !movieId) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Code, username, and movieId are required' 
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
    
    // Check if we're in the right phase
    if (session.votingPhase !== 'locked' && session.votingPhase !== 'vetoing') {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Not in voting phase' 
      }, { status: 400 });
    }
    
    // Update voting phase to vetoing if this is the first veto
    if (session.votingPhase === 'locked') {
      session.votingPhase = 'vetoing';
    }
    
    // Record the veto
    participant.vetoedMovieId = movieId;
    if (nominationId) {
      participant.vetoedNominationId = nominationId;
    }
    participant.hasVoted = true;
    
    // Check if everyone has vetoed
    const allVetoed = session.participants.every(p => p.hasVoted);
    
    if (allVetoed) {
      // Check if only one movie remains after vetoes
      const remainingMovies = getRemainingMovies(session);
      
      if (remainingMovies.length <= 1) {
        // Skip directly to results - there's only one movie left
        session.votingPhase = 'results';
        session.votingResults = calculateRankedChoiceWinner(session);
        console.log(`🏆 Only one movie remains after vetoes for session ${code}. Winner: ${remainingMovies[0]?.title || 'Unknown'}`);
      } else {
        // Transition to final ranking phase
        session.votingPhase = 'finalRanking';
        
        // Reset finalMovies for all participants
        session.participants.forEach(p => {
          p.finalMovies = undefined;
        });
        
        console.log(`🎯 All vetoes complete for session ${code}. Moving to final ranking phase.`);
      }
    }
    
    await redis.setex(
      `session:${code.trim().toUpperCase()}`, 
      24 * 60 * 60, 
      JSON.stringify(session)
    );
    
    console.log(`❌ ${username} vetoed movie ${movieId} in session ${code}`);
    
    return NextResponse.json<SessionResponse>({ 
      success: true, 
      session 
    });
    
  } catch (error) {
    console.error('Veto movie error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to veto movie' 
    }, { status: 500 });
  }
} 