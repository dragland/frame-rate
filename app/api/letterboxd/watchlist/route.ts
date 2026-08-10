import { NextRequest, NextResponse } from 'next/server';
import { fetchLetterboxdWatchlist, LetterboxdWatchlist } from '@/lib/letterboxd-watchlist-server';
import { isValidUsername, normalizeUsername } from '@/lib/validation';

export const dynamic = 'force-dynamic';
// The pagination walk is budgeted at ~20s (WALK_BUDGET_MS); give the route
// headroom past that instead of the platform default
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username?.trim() || !isValidUsername(username)) {
      return NextResponse.json<LetterboxdWatchlist>({
        username: '',
        slugs: [],
        truncated: false
      }, { status: 400 });
    }

    const watchlist = await fetchLetterboxdWatchlist(normalizeUsername(username));

    return NextResponse.json<LetterboxdWatchlist>(watchlist);

  } catch (error) {
    console.error('Letterboxd watchlist fetch error:', error);
    return NextResponse.json<LetterboxdWatchlist>({
      username: '',
      slugs: [],
      truncated: false
    }, { status: 500 });
  }
}
