'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Movie, getImageUrl, formatRuntime } from '@/lib/tmdb';
import { MOVIE_CONFIG } from '@/lib/constants';

interface DraggableMovieItemProps {
  movie: Movie;
  index: number;
  onRemove: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  showDivider?: boolean;
  isVotingLocked?: boolean;
}

export default function DraggableMovieItem({ movie, index, onRemove, onMove, showDivider, isVotingLocked = false }: DraggableMovieItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedOver, setDraggedOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (isVotingLocked) {
      e.preventDefault();
      return;
    }
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (isVotingLocked) return;
    e.preventDefault();
    setDraggedOver(true);
  };

  const handleDragLeave = () => {
    setDraggedOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isVotingLocked) return;
    e.preventDefault();
    setDraggedOver(false);
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (fromIndex !== index) {
      onMove(fromIndex, index);
    }
  };

  const year = movie.release_date?.split('-')[0];

  return (
    <>
      <div
        draggable={!isVotingLocked}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          flex items-center space-x-3 p-3 bg-gray-800 rounded-lg transition-all
          ${isVotingLocked ? 'cursor-default' : 'cursor-move'}
          ${isDragging ? 'opacity-50' : ''}
          ${draggedOver ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-300 dark:border-blue-600' : ''}
          ${isVotingLocked ? '' : 'hover:bg-gray-100 hover:dark:bg-gray-600'}
          ${isVotingLocked ? 'opacity-70' : ''}
        `}
      >
        <div className="text-gray-400 dark:text-gray-500 flex flex-col space-y-0.5">
          <div className="w-1.5 h-0.5 bg-current rounded-full"></div>
          <div className="w-1.5 h-0.5 bg-current rounded-full"></div>
          <div className="w-1.5 h-0.5 bg-current rounded-full"></div>
        </div>
        <Image
          src={getImageUrl(movie.poster_path)}
          alt={movie.title}
          width={40}
          height={60}
          className="rounded flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate text-white">{movie.title}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 space-x-2">
            {year && <span>{year}</span>}
            {movie.runtime && <span>• {formatRuntime(movie.runtime)}</span>}
            {movie.letterboxdRating ? (
              <a
                href={movie.letterboxdRating.filmUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                onClick={(e) => e.stopPropagation()}
              >
                ⭐ {movie.letterboxdRating.rating.toFixed(1)}
              </a>
            ) : (
              <span className="text-gray-400 dark:text-gray-500">⭐ N/A</span>
            )}
            <span className="text-yellow-600 dark:text-yellow-400">{Math.round(movie.vote_average * 10)}%</span>
          </div>
        </div>
        <button
          onClick={isVotingLocked ? undefined : onRemove}
          disabled={isVotingLocked}
          className={`w-6 h-6 rounded-full text-white text-sm flex items-center justify-center flex-shrink-0 transition-colors ${
            isVotingLocked
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gray-500 hover:bg-gray-600'
          }`}
        >
          −
        </button>
      </div>
      {showDivider && (
        <div className="my-4 border-t border-gray-700 relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-gray-900 px-3 text-xs text-gray-400 font-medium">
              Top {MOVIE_CONFIG.MAX_NOMINATIONS_PER_USER} Picks
            </div>
          </div>
        </div>
      )}
    </>
  );
}
