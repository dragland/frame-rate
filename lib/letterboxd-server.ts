/**
 * Server-side Letterboxd utilities
 * This file contains server-side only functions for Letterboxd integration
 */

import getRedisClient from './redis';
import { CACHE_CONFIG } from './constants';
import { fetchLetterboxdHtml } from './letterboxd-rating-server';

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
 * Cloudflare challenges Letterboxd profile pages (film pages and RSS feeds
 * stay open). When the profile page is unreachable, the RSS feed answers
 * "does this user exist?" and links their latest activity page, which shows
 * their avatar.
 */
async function fetchProfileViaRss(
  username: string
): Promise<{ profilePicture: string | null } | 'not-found' | null> {
  const rss = await fetchLetterboxdHtml(`/${username}/rss/`);

  if (rss === 'not-found' || rss === null) {
    return rss;
  }

  const itemLink = rss.html.match(/<item>[\s\S]*?<link>([^<]+)<\/link>/i)?.[1];
  if (!itemLink) {
    // Exists, but no activity to pull an avatar from
    return { profilePicture: null };
  }

  const page = await fetchLetterboxdHtml(itemLink.replace('https://letterboxd.com', ''));
  if (page === null || page === 'not-found') {
    return { profilePicture: null };
  }

  // The activity page shows the author's avatar with alt="username"
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const avatarMatch =
    page.html.match(new RegExp(`<img[^>]+src="([^"]*avatar[^"]*)"[^>]+alt="${escaped}"`, 'i')) ??
    page.html.match(new RegExp(`<img[^>]+alt="${escaped}"[^>]+src="([^"]*avatar[^"]*)"`, 'i'));

  // Ask the CDN for a larger crop than the inline 24/48px one
  const profilePicture = avatarMatch?.[1]?.replace(/-0-\d+-0-\d+-crop/, '-0-220-0-220-crop') ?? null;

  return { profilePicture };
}

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
  // v2: v1 cached Cloudflare blocks as exists:false
  const cacheKey = `letterboxd:profile:v2:${cleanUsername}`;

  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await fetchLetterboxdHtml(`/${cleanUsername}/`)
      ?? await fetchProfileViaRss(cleanUsername);

    // Blocked or unreachable — we don't actually know anything, so don't
    // cache a wrong answer; the next attempt can retry
    if (result === null) {
      console.warn(`Letterboxd unreachable while validating profile: ${cleanUsername}`);
      return {
        username: cleanUsername,
        profilePicture: null,
        exists: false
      };
    }

    const profile: LetterboxdProfile = result === 'not-found'
      ? {
          username: cleanUsername,
          profilePicture: null,
          exists: false
        }
      : {
          username: cleanUsername,
          profilePicture: 'profilePicture' in result
            ? result.profilePicture
            : extractProfilePicture(result.html),
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
