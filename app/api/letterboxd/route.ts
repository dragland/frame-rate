import { NextRequest, NextResponse } from 'next/server';
import getRedisClient from '@/lib/redis';
import { CACHE_CONFIG } from '@/lib/constants';
import { fetchLetterboxdRating } from '@/lib/letterboxd-rating-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get('tmdbId');

  if (!tmdbId || !/^\d+$/.test(tmdbId)) {
    return NextResponse.json({ error: 'tmdbId parameter is required and must be numeric' }, { status: 400 });
  }

  const redis = getRedisClient();
  const cacheKey = `letterboxd:rating:${tmdbId}`;

  try {
    // Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return NextResponse.json(JSON.parse(cached));
    }

    const data = await fetchLetterboxdRating(tmdbId);

    if (!data) {
      return NextResponse.json({ error: 'Rating not found' }, { status: 404 });
    }

    // Cache the result for 6 hours
    await redis.setex(
      cacheKey,
      CACHE_CONFIG.TTL,
      JSON.stringify(data)
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('Letterboxd scraping error:', error);
    return NextResponse.json({ error: 'Scraping failed' }, { status: 500 });
  }
} 
