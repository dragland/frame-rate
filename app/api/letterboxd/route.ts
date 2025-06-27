import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get('tmdbId');

  if (!tmdbId) {
    return NextResponse.json({ error: 'tmdbId parameter is required' }, { status: 400 });
  }

  try {
    const url = `https://letterboxd.com/tmdb/${tmdbId}/`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch from Letterboxd' }, { status: 404 });
    }

    const html = await response.text();
    
    // Extract rating from Twitter meta tag using regex
    const ratingMetaMatch = html.match(/<meta name="twitter:data2" content="([^"]*)" \/>/);
    
    if (!ratingMetaMatch || !ratingMetaMatch[1] || !ratingMetaMatch[1].includes('out of 5')) {
      return NextResponse.json({ error: 'Rating not found' }, { status: 404 });
    }

    const ratingMeta = ratingMetaMatch[1];
    
    // Parse "3.79 out of 5" format
    const ratingMatch = ratingMeta.match(/^([\d.]+)\s+out of 5$/);
    if (!ratingMatch) {
      return NextResponse.json({ error: 'Could not parse rating' }, { status: 500 });
    }

    const rating = parseFloat(ratingMatch[1]);
    
    return NextResponse.json({
      rating,
      ratingText: ratingMeta,
      filmUrl: response.url,
      tmdbId: parseInt(tmdbId)
    });
  } catch (error) {
    console.error('Letterboxd scraping error:', error);
    return NextResponse.json({ error: 'Scraping failed' }, { status: 500 });
  }
} 