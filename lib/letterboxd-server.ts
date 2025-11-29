/**
 * Server-side Letterboxd utilities
 * This file contains server-side only functions for Letterboxd integration
 */

import getRedisClient from './redis';
import { CACHE_CONFIG } from './constants';

export interface LetterboxdProfile {
  username: string;
  profilePicture: string | null;
  exists: boolean;
}

/**
 * Avatar patterns to extract profile pictures from Letterboxd HTML
 * Ordered by reliability
 */
const AVATAR_PATTERNS = [
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

/**
 * User agent for Letterboxd requests
 */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

/**
 * Extracts profile picture URL from Letterboxd HTML
 */
function extractProfilePicture(html: string): string | null {
  for (const pattern of AVATAR_PATTERNS) {
    const match = html.match(pattern);
    if (match && match[1]) {
      let profilePicture = match[1].replace(/['"]/g, '');

      // Handle relative URLs
      if (profilePicture.startsWith('//')) {
        profilePicture = 'https:' + profilePicture;
      } else if (profilePicture.startsWith('/')) {
        profilePicture = 'https://letterboxd.com' + profilePicture;
      }

      return profilePicture;
    }
  }

  return null;
}

/**
 * Validates a Letterboxd profile and extracts profile picture
 * This is a server-side only function that scrapes Letterboxd
 * Results are cached for 7 days to reduce scraping load
 *
 * @param username - The Letterboxd username to validate
 * @returns Profile information including existence and picture URL
 */
export async function validateLetterboxdProfile(username: string): Promise<LetterboxdProfile> {
  if (!username?.trim()) {
    return {
      username: '',
      profilePicture: null,
      exists: false
    };
  }

  const cleanUsername = username.trim().toLowerCase();
  const redis = getRedisClient();
  const cacheKey = `letterboxd:profile:${cleanUsername}`;

  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const profileUrl = `https://letterboxd.com/${cleanUsername}/`;

    const response = await fetch(profileUrl, {
      headers: {
        'User-Agent': USER_AGENT
      }
    });

    const profile: LetterboxdProfile = !response.ok
      ? {
          username: cleanUsername,
          profilePicture: null,
          exists: false
        }
      : {
          username: cleanUsername,
          profilePicture: extractProfilePicture(await response.text()),
          exists: true
        };

    // Cache the result for 6 hours
    await redis.setex(
      cacheKey,
      CACHE_CONFIG.TTL,
      JSON.stringify(profile)
    );

    return profile;
  } catch (error) {
    console.error('Failed to validate Letterboxd profile:', error);
    return {
      username: cleanUsername,
      profilePicture: null,
      exists: false
    };
  }
}
