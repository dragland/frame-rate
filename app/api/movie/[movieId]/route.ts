import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '@/lib/redis';
import { API_CONFIG, CACHE_CONFIG } from '@/lib/constants';
import { isPositiveInteger } from '@/lib/validation';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

interface TMDBPerson {
  job?: string;
  name?: string;
}

interface TMDBMovieDetails {
  credits?: {
    crew?: TMDBPerson[];
  };
  runtime?: number;
  director?: string;
  [key: string]: unknown;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ movieId: string }> }
) {
  const { movieId } = await params;
  const parsedMovieId = Number.parseInt(movieId, 10);

  if (!isPositiveInteger(parsedMovieId)) {
    return NextResponse.json({ error: 'movieId must be a positive integer' }, { status: 400 });
  }

  if (!TMDB_API_KEY) {
    return NextResponse.json({ error: 'TMDB API key not configured' }, { status: 500 });
  }

  const redis = getRedisClient();
  const cacheKey = `tmdb:movie:${parsedMovieId}`;

  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    const response = await fetch(
      `${API_CONFIG.TMDB_BASE_URL}/movie/${parsedMovieId}?api_key=${TMDB_API_KEY}&append_to_response=credits`
    );

    if (!response.ok) {
      throw new Error('TMDB API request failed');
    }

    const data: TMDBMovieDetails = await response.json();

    // Extract director from credits
    const director = data.credits?.crew?.find(
      (person: TMDBPerson) => person.job === 'Director'
    )?.name;

    // Prepare response data
    const movieData = {
      ...data,
      director
    };

    // Cache the result for 6 hours
    await redis.setex(
      cacheKey,
      CACHE_CONFIG.TTL,
      JSON.stringify(movieData)
    );

    return NextResponse.json(movieData);
  } catch (error) {
    console.error('Movie details error:', error);
    return NextResponse.json({ error: 'Failed to fetch movie details' }, { status: 500 });
  }
} 
