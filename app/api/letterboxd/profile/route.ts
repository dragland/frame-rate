import { NextRequest, NextResponse } from 'next/server';

export interface LetterboxdProfile {
  username: string;
  profilePicture: string | null;
  exists: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    
    if (!username?.trim()) {
      return NextResponse.json<LetterboxdProfile>({ 
        username: '',
        profilePicture: null,
        exists: false 
      }, { status: 400 });
    }
    
    const cleanUsername = username.trim().toLowerCase();
    const profileUrl = `https://letterboxd.com/${cleanUsername}/`;
    
    try {
      const response = await fetch(profileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        return NextResponse.json<LetterboxdProfile>({ 
          username: cleanUsername,
          profilePicture: null,
          exists: false 
        });
      }
      
      const html = await response.text();
      
      // Extract profile picture from the HTML
      let profilePicture: string | null = null;
      
      // Look for avatar image in various formats
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
      
      return NextResponse.json<LetterboxdProfile>({ 
        username: cleanUsername,
        profilePicture,
        exists: true 
      });
      
    } catch (fetchError) {
      console.error('Failed to fetch Letterboxd profile:', fetchError);
      return NextResponse.json<LetterboxdProfile>({ 
        username: cleanUsername,
        profilePicture: null,
        exists: false 
      });
    }
    
  } catch (error) {
    console.error('Letterboxd profile validation error:', error);
    return NextResponse.json<LetterboxdProfile>({ 
      username: '',
      profilePicture: null,
      exists: false 
    }, { status: 500 });
  }
} 