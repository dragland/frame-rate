import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '@/lib/redis';
import { Session } from '@/lib/types';
import { fetchLetterboxdWatchlist, LetterboxdWatchlist } from '@/lib/letterboxd-watchlist-server';
import { isEligibleVoter } from '@/lib/voting';
import { isValidSessionCode, isValidUsername, normalizeSessionCode, normalizeUsername } from '@/lib/validation';

export const dynamic = 'force-dynamic';
// The pagination walk is budgeted at ~20s (WALK_BUDGET_MS); give the route
// headroom past that instead of the platform default
export const maxDuration = 30;

const emptyResponse = (status: number) =>
  NextResponse.json<LetterboxdWatchlist>({ username: '', slugs: [] }, { status });

/**
 * Watchlists are public data, but a cold lookup costs up to 20 upstream page
 * fetches — so unlike the profile/rating routes, this one is gated: the
 * username must belong to a live session (as a participant, or in the frozen
 * nomination pool for mid-vote rejoiners), which keeps the endpoint from
 * being a free scraping proxy for arbitrary usernames.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const code = searchParams.get('code');

    if (!username?.trim() || !isValidUsername(username) || !code?.trim() || !isValidSessionCode(code)) {
      return emptyResponse(400);
    }

    const cleanUsername = normalizeUsername(username);

    const redis = getRedisClient();
    const sessionData = await redis.get(`session:${normalizeSessionCode(code)}`);
    if (!sessionData) {
      return emptyResponse(404);
    }

    const session: Session = JSON.parse(sessionData);
    const isMember =
      session.participants.some(p => p.username === cleanUsername) ||
      isEligibleVoter(session, cleanUsername);
    if (!isMember) {
      return emptyResponse(403);
    }

    const watchlist = await fetchLetterboxdWatchlist(cleanUsername);

    return NextResponse.json<LetterboxdWatchlist>(watchlist);

  } catch (error) {
    console.error('Letterboxd watchlist fetch error:', error);
    return emptyResponse(500);
  }
}
