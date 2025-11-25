import { NextRequest, NextResponse } from 'next/server';
import { validateLetterboxdProfile, LetterboxdProfile } from '@/lib/letterboxd-server';

export type { LetterboxdProfile };

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

    const profile = await validateLetterboxdProfile(username);

    return NextResponse.json<LetterboxdProfile>(profile);

  } catch (error) {
    console.error('Letterboxd profile validation error:', error);
    return NextResponse.json<LetterboxdProfile>({
      username: '',
      profilePicture: null,
      exists: false
    }, { status: 500 });
  }
} 