import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '../../../../lib/redis';
import { Session, CreateSessionRequest, SessionResponse } from '../../../../lib/types';
import { LetterboxdProfile } from '../../letterboxd/profile/route';

const generateSessionCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

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