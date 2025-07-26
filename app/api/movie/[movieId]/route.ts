import { NextRequest, NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export async function GET(
  request: NextRequest,
  { params }: { params: { movieId: string } }
) {
  const { movieId } = params;

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`
    );

    if (!response.ok) {
      throw new Error('TMDB API request failed');
    }

    const data = await response.json();
    
    // Extract director from credits
    const director = data.credits?.crew?.find((person: any) => person.job === 'Director')?.name;
    
    // Return movie data with director
    return NextResponse.json({
      ...data,
      director
    });
  } catch (error) {
    console.error('Movie details error:', error);
    return NextResponse.json({ error: 'Failed to fetch movie details' }, { status: 500 });
  }
} 