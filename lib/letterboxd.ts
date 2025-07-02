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
    console.error('Failed to fetch Letterboxd rating:', error);
    return null;
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
    console.error('Failed to validate Letterboxd profile:', error);
    return {
      username: username.trim().toLowerCase(),
      profilePicture: null,
      exists: false
    };
  }
}; 