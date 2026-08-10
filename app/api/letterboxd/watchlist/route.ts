import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '@/lib/redis';
import { Session } from '@/lib/types';
import { fetchLetterboxdWatchlist, LetterboxdWatchlist } from '@/lib/letterboxd-watchlist-server';
import { isEligibleVoter } from '@/lib/voting';
import { isValidSessionCode, isValidUsername, normalizeSessionCode, normalizeUsername } from '@/lib/validation';

export const dynamic = 'force-dynamic';
// Worst case: the ~20s walk budget is checked at batch boundaries, and one
// final batch can add up to ~25s (direct + Jina fallback timeouts) — 60s
// covers the true ceiling instead of killing the walk mid-batch
export const maxDuration = 60;

const emptyResponse = (status: number) =>
  NextResponse.json<LetterboxdWatchlist>({ username: '', slugs: [] }, { status });

/**
 * Watchlists are public data, but a cold lookup costs up to ~100 upstream
 * page fetches — so unlike the profile/rating routes, this one is gated: the
 * username must belong to a live session (as a participant, or in the frozen
 * nomination pool for mid-vote rejoiners), which keeps the endpoint from
 * being a free scraping proxy for arbitrary usernames.
 *
 * Known residual: a determined caller can mint their own session under any
 * username and pass the gate. Accepted — session creation already triggers
 * profile scraping ungated, results cache for 6h, and the walk is
 * time-budgeted, so the gate's job is raising cost, not perfect authz.
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
