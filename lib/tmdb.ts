// Get your API key from https://www.themoviedb.org/settings/api
// Add TMDB_API_KEY=your_key_here to your .env.local file

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
}

export interface SearchResponse {
  page: number;
  results: Movie[];
  total_pages: number;
  total_results: number;
}

export const searchMovies = async (query: string, page = 1): Promise<SearchResponse> => {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}`);
  if (!response.ok) {
    throw new Error('Search request failed');
  }
  return response.json();
};

export const getImageUrl = (path: string | null): string => {
  if (!path) return 'data:image/svg+xml,%3Csvg width="500" height="750" viewBox="0 0 500 750" fill="none" xmlns="http://www.w3.org/2000/svg"%3E%3Crect width="500" height="750" fill="%23374151"/%3E%3Ctext x="250" y="375" text-anchor="middle" fill="%23ffffff" font-family="Arial" font-size="24"%3ENo Image%3C/text%3E%3C/svg%3E';
  return `${TMDB_IMAGE_BASE}${path}`;
};

 