import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, UpdateFinalMoviesRequest, SessionResponse } from '../../../../lib/types';
import { calculateRankedChoiceWinner, getRemainingMovies } from '../../../../lib/voting';

export async function POST(request: NextRequest) {
  try {
    const { code, username, movies }: UpdateFinalMoviesRequest = await request.json();
    
    if (!code?.trim() || !username?.trim() || !Array.isArray(movies)) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Code, username, and movies array are required' 
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
    if (session.votingPhase !== 'finalRanking') {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Not in final ranking phase' 
      }, { status: 400 });
    }
    
    // Validate that movies are from the remaining movies list
    const remainingMovies = getRemainingMovies(session);
    const remainingMovieIds = new Set(remainingMovies.map(m => m.id));
    const invalidMovies = movies.filter(m => !remainingMovieIds.has(m.id));
    
    if (invalidMovies.length > 0) {
      return NextResponse.json<SessionResponse>({ 
        success: false, 
        error: 'Invalid movies in final ranking' 
      }, { status: 400 });
    }
    
    // Update participant's final movies
    participant.finalMovies = movies;
    
    // Check if everyone has completed final rankings
    const allCompleted = session.participants.every(p => p.finalMovies && p.finalMovies.length > 0);
    
    if (allCompleted) {
      // Calculate final results using final rankings
      session.votingPhase = 'results';
      session.votingResults = calculateRankedChoiceWinner(session);
      console.log(`🏆 Final ranking complete for session ${code}. Winner: ${session.votingResults.winner.title}`);
    }
    
    await redis.setex(
      `session:${code.trim().toUpperCase()}`, 
      24 * 60 * 60, 
      JSON.stringify(session)
    );
    
    console.log(`🎯 ${username} completed final ranking in session ${code}`);
    
    return NextResponse.json<SessionResponse>({ 
      success: true, 
      session 
    });
    
  } catch (error) {
    console.error('Update final movies error:', error);
    return NextResponse.json<SessionResponse>({ 
      success: false, 
      error: 'Failed to update final movies' 
    }, { status: 500 });
  }
} 