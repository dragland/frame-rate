export interface LetterboxdRatingData {
  rating: number;
  ratingText: string;
  filmUrl: string;
  tmdbId: number;
}

const LETTERBOXD_BASE_URL = 'https://letterboxd.com';
const JINA_READER_BASE_URL = 'https://r.jina.ai/';

const LETTERBOXD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function isCloudflareChallenge(html: string): boolean {
  return html.includes('challenges.cloudflare.com') || html.includes('<title>Just a moment...</title>');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function extractLetterboxdRating(html: string): Pick<LetterboxdRatingData, 'rating' | 'ratingText'> | null {
  const twitterMetaMatch = html.match(/<meta\s+name=["']twitter:data2["']\s+content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']twitter:data2["'][^>]*>/i);

  if (twitterMetaMatch?.[1]) {
    const ratingText = decodeHtmlEntities(twitterMetaMatch[1]).trim();
    const ratingMatch = ratingText.match(/^(\d+(?:\.\d+)?)\s+out of 5$/i);

    if (ratingMatch) {
      return {
        rating: Number.parseFloat(ratingMatch[1]),
        ratingText,
      };
    }
  }

  const jsonLdRatingMatch = html.match(/"aggregateRating"\s*:\s*\{[^}]*"ratingValue"\s*:\s*(\d+(?:\.\d+)?)/i)
    ?? html.match(/"ratingValue"\s*:\s*(\d+(?:\.\d+)?)[^}]*"@type"\s*:\s*"aggregateRating"/i);

  if (jsonLdRatingMatch?.[1]) {
    const rating = Number.parseFloat(jsonLdRatingMatch[1]);
    return {
      rating,
      ratingText: `${rating} out of 5`,
    };
  }

  return null;
}

export function extractLetterboxdFilmUrl(html: string, fallbackUrl: string): string {
  const urlMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta\s+property=["']og:url["']\s+content=["']([^"']+)["'][^>]*>/i)
    ?? html.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:url["'][^>]*>/i);

  if (!urlMatch?.[1]) {
    return fallbackUrl;
  }

  const filmUrl = decodeHtmlEntities(urlMatch[1]).trim();

  if (filmUrl.startsWith('/')) {
    return `${LETTERBOXD_BASE_URL}${filmUrl}`;
  }

  return filmUrl;
}

export type LetterboxdPage = { html: string; url: string };

// 'not-found' = Letterboxd said the page doesn't exist (cacheable);
// null = we couldn't get a real answer (Cloudflare block, network) — retryable
export type LetterboxdFetchResult = LetterboxdPage | 'not-found' | null;

async function fetchDirectLetterboxdHtml(path: string): Promise<LetterboxdFetchResult> {
  const url = `${LETTERBOXD_BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      headers: LETTERBOXD_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 404) {
      return 'not-found';
    }

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    if (isCloudflareChallenge(html)) {
      return null;
    }

    return {
      html,
      url: response.url,
    };
  } catch {
    return null;
  }
}

async function fetchProxiedLetterboxdHtml(path: string): Promise<LetterboxdFetchResult> {
  const letterboxdUrl = `${LETTERBOXD_BASE_URL}${path}`;

  try {
    const response = await fetch(`${JINA_READER_BASE_URL}${letterboxdUrl}`, {
      headers: {
        ...LETTERBOXD_HEADERS,
        'X-Respond-With': 'html',
      },
      signal: AbortSignal.timeout(15_000),
    });

    // Jina forwards the upstream status for missing pages
    if (response.status === 404 || response.status === 422) {
      return 'not-found';
    }

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    if (isCloudflareChallenge(html)) {
      return null;
    }

    return {
      html,
      url: letterboxdUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a Letterboxd page: direct first, Jina Reader proxy when Cloudflare
 * blocks us. Shared by the rating and profile scrapers.
 */
export async function fetchLetterboxdHtml(path: string): Promise<LetterboxdFetchResult> {
  const direct = await fetchDirectLetterboxdHtml(path);
  if (direct !== null) {
    return direct;
  }

  return fetchProxiedLetterboxdHtml(path);
}

export async function fetchLetterboxdRating(tmdbId: string): Promise<LetterboxdRatingData | null> {
  const htmlResult = await fetchLetterboxdHtml(`/tmdb/${tmdbId}/`);

  if (!htmlResult || htmlResult === 'not-found') {
    return null;
  }

  const rating = extractLetterboxdRating(htmlResult.html);

  if (!rating) {
    return null;
  }

  return {
    ...rating,
    filmUrl: extractLetterboxdFilmUrl(htmlResult.html, htmlResult.url),
    tmdbId: Number.parseInt(tmdbId, 10),
  };
}
