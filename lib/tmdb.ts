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
  if (!path) return '/placeholder-movie.png';
  return `${TMDB_IMAGE_BASE}${path}`;
};

 