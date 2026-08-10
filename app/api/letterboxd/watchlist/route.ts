import { NextRequest, NextResponse } from 'next/server';
import { fetchLetterboxdWatchlist, LetterboxdWatchlist } from '@/lib/letterboxd-watchlist-server';
import { isValidUsername, normalizeUsername } from '@/lib/validation';

export type { LetterboxdWatchlist };

export const dynamic = 'force-dynamic';

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
