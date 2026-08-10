import { LetterboxdProfile } from '../app/api/letterboxd/profile/route';

export interface LetterboxdRating {
  rating: number;
  ratingText: string;
  filmUrl: string;
  tmdbId: number;
}

export const getLetterboxdRating = async (tmdbId: number): Promise<LetterboxdRating | null> => {
  try {
    const response = await fetch(`/api/letterboxd?tmdbId=${tmdbId}`);
    
    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    return null;
  }
};

/**
 * Extract the film slug from a Letterboxd film URL
 * (e.g. "https://letterboxd.com/film/the-matrix/" → "the-matrix").
 * This is how movies are matched against watchlist slug sets.
 */
export const filmSlugFromUrl = (filmUrl: string | undefined): string | null => {
  const match = filmUrl?.match(/\/film\/([^/?#]+)/);
  return match ? match[1] : null;
};

// sessionCode required: the route only serves usernames belonging to that session
export const getLetterboxdWatchlist = async (username: string, sessionCode: string): Promise<string[]> => {
  try {
    const response = await fetch(
      `/api/letterboxd/watchlist?username=${encodeURIComponent(username)}&code=${encodeURIComponent(sessionCode)}`
    );

    if (!response.ok) {
      return [];
    }

    const watchlist = await response.json();
    return Array.isArray(watchlist.slugs) ? watchlist.slugs : [];
  } catch (error) {
    return [];
  }
};

export const validateLetterboxdProfile = async (username: string): Promise<LetterboxdProfile> => {
  if (!username?.trim()) {
    return {
      username: '',
      profilePicture: null,
      exists: false
    };
  }

  try {
    const response = await fetch(`/api/letterboxd/profile?username=${encodeURIComponent(username.trim())}`);
    const profile: LetterboxdProfile = await response.json();
    return profile;
  } catch (error) {
    return {
      username: username.trim().toLowerCase(),
      profilePicture: null,
      exists: false
    };
  }
}; 