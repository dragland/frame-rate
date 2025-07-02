import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, JoinSessionRequest, SessionResponse } from '../../../../lib/types';
import { LetterboxdProfile } from '../../letterboxd/profile/route';

const validateLetterboxdProfile = async (username: string): Promise<LetterboxdProfile> => {
  try {
    const profileUrl = `https://letterboxd.com/${username.toLowerCase()}/`;
    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      return { username, profilePicture: null, exists: false };
    }
    
    const html = await response.text();
    let profilePicture: string | null = null;
    
    const avatarPatterns = [
      // Meta tags (most reliable for Letterboxd)
      /<meta\s+property="og:image"\s+content="([^"]+)"/i,
      /<meta\s+name="twitter:image"\s+content="([^"]+)"/i,
      // Traditional img tags
      /<img[^>]+class="[^"]*avatar[^"]*"[^>]+src="([^"]+)"/i,
      /<img[^>]+src="([^"]+)"[^>]+class="[^"]*avatar[^"]*"/i,
      /<img[^>]+class="[^"]*profile-avatar[^"]*"[^>]+src="([^"]+)"/i,
      /<img[^>]+src="([^"]+)"[^>]+class="[^"]*profile-avatar[^"]*"/i,
      // Background images
      /<div[^>]+class="[^"]*avatar[^"]*"[^>]*style="[^"]*background-image:\s*url\(([^)]+)\)/i
    ];
    
    for (const pattern of avatarPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        profilePicture = match[1].replace(/['"]/g, '');
        if (profilePicture.startsWith('//')) {
          profilePicture = 'https:' + profilePicture;
        } else if (profilePicture.startsWith('/')) {
          profilePicture = 'https://letterboxd.com' + profilePicture;
        }
        break;
      }
    }
    
    return { username, profilePicture, exists: true };
  } catch (error) {
    return { username, profilePicture: null, exists: false };
  }
};

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

    // Validate Letterboxd profile for new participant
    const profile = await validateLetterboxdProfile(trimmedUsername);
    
    // Add new participant
    session.participants.push({
      username: trimmedUsername,
      movies: [],
      joinedAt: new Date(),
      profilePicture: profile.profilePicture,
      letterboxdExists: profile.exists,
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