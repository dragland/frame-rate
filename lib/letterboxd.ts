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