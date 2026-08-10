'use client';

import Image from 'next/image';
import { Movie, getImageUrl, formatRuntime } from '@/lib/tmdb';
import WatchlistAvatarStack, { WatchlistedByEntry } from './WatchlistAvatarStack';

/** Character threshold for showing "Show more" button on descriptions */
const DESCRIPTION_TRUNCATE_LENGTH = 150;

interface MovieCardProps {
  movie: Movie;
  onAdd: () => void;
  onRemove: () => void;
  isInList: boolean;
  isExpanded: boolean;
  onToggleDescription: () => void;
  disabled?: boolean;
  /** Participants who have this film on their Letterboxd watchlist */
  watchlistedBy?: WatchlistedByEntry[];
}

export default function MovieCard({ movie, onAdd, onRemove, isInList, isExpanded, onToggleDescription, disabled = false, watchlistedBy = [] }: MovieCardProps) {
  const year = movie.release_date?.split('-')[0];

  return (
    <div className="movie-card">
      <div className="relative flex-shrink-0 aspect-[2/3] bg-gray-100 dark:bg-gray-800">
        <Image
          src={getImageUrl(movie.poster_path)}
          alt={movie.title}
          width={500}
          height={750}
          className="w-full h-full object-contain"
        />
        {/* Top-left: the bottom corners collide at the md breakpoint, where
            three-column cards are only ~100px wide next to the rating pill */}
        {watchlistedBy.length > 0 && (
          <div className="absolute top-2 left-2 bg-black/60 rounded-full px-1.5 py-1">
            <WatchlistAvatarStack participants={watchlistedBy} ringClassName="ring-black/60" />
          </div>
        )}
        <div className="absolute bottom-2 right-2">
          {movie.letterboxdRating ? (
            <a
              href={movie.letterboxdRating.filmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-blue-600 text-white px-3 py-2 rounded text-sm flex items-center space-x-2 hover:bg-blue-700 transition-colors"
            >
              <span className="text-green-400">⭐ {movie.letterboxdRating.rating.toFixed(1)}</span>
              <span className="text-yellow-400">{Math.round(movie.vote_average * 10)}%</span>
            </a>
          ) : (
            <div className="bg-blue-600 text-white px-3 py-2 rounded text-sm flex items-center">
              <span className="text-yellow-400">{Math.round(movie.vote_average * 10)}%</span>
            </div>
          )}
        </div>
      </div>
      <div className="p-4 flex flex-col h-full">
        <div className="mb-2">
          <h3 className="font-bold text-lg text-white line-clamp-2 mb-1">
            {movie.title}
          </h3>
          {(year || movie.runtime || movie.director) && (
            <div className="text-xs text-gray-500 dark:text-gray-400 space-x-2">
              {year && <span>{year}</span>}
              {movie.runtime && <span>• {formatRuntime(movie.runtime)}</span>}
              {movie.director && <span>• {movie.director}</span>}
            </div>
          )}
        </div>

        <button
          onClick={isInList ? onRemove : onAdd}
          disabled={disabled}
          className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors mb-3 ${
            disabled
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : isInList
              ? 'bg-gray-500 hover:bg-gray-600 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {disabled ? 'Locked' : isInList ? '− Cut' : '+ Nominate'}
        </button>

        <div
          onClick={onToggleDescription}
          className="cursor-pointer flex-grow mb-3"
        >
          <p className={`text-gray-300 text-sm ${isExpanded ? '' : 'line-clamp-3'}`}>
            {movie.overview}
          </p>
          {movie.overview && movie.overview.length > DESCRIPTION_TRUNCATE_LENGTH && (
            <button className="text-blue-500 hover:text-blue-600 text-xs mt-1">
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {movie.letterboxdRating && (
          <a
            href={movie.letterboxdRating.filmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block bg-blue-600 text-white py-2 px-4 rounded text-sm hover:bg-blue-700 transition-colors text-center"
          >
            Letterboxd
          </a>
        )}
      </div>
    </div>
  );
}
