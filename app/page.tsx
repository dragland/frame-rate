'use client';

import React, { useState, useEffect } from 'react';
import { searchMovies, Movie, getImageUrl } from '../lib/tmdb';
import Image from 'next/image';

export default function Home() {
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [myMovies, setMyMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoggedIn(true);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    setIsLoading(true);
    try {
      const results = await searchMovies(query);
      setSearchResults(results.results.slice(0, 5)); // Show top 5 results
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    }
    setIsLoading(false);
  };

  const addToMyList = (movie: Movie) => {
    if (!myMovies.find(m => m.id === movie.id)) {
      setMyMovies([...myMovies, movie]);
    }
  };

  const removeFromMyList = (movieId: number) => {
    setMyMovies(myMovies.filter(m => m.id !== movieId));
  };

  const moveMovie = (fromIndex: number, toIndex: number) => {
    const updatedMovies = [...myMovies];
    const [removed] = updatedMovies.splice(fromIndex, 1);
    updatedMovies.splice(toIndex, 0, removed);
    setMyMovies(updatedMovies);
  };

  const isInMyList = (movieId: number) => {
    return myMovies.some(m => m.id === movieId);
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md w-full">
          <h1 className="text-4xl font-bold text-center mb-8 dark:text-white">🎬 Frame Rate</h1>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-8">
            Choose movies for your group movie night
          </p>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Join Session
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 right-4 z-50 bg-blue-500 text-white p-2 rounded-lg shadow-lg"
      >
        {sidebarOpen ? '✕' : `📋 ${myMovies.length}`}
      </button>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 md:mr-80">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold dark:text-white">🎬 Frame Rate</h1>
            <div className="text-gray-600 dark:text-gray-300">
              Welcome, {username}!
            </div>
          </div>

          {/* Search Section */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search for movies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isLoading && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          )}

          <div className="movie-grid">
            {searchResults.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onAdd={() => addToMyList(movie)}
                onRemove={() => removeFromMyList(movie.id)}
                isInList={isInMyList(movie.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed md:relative top-0 right-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl border-l dark:border-gray-700 z-40
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 h-full overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold dark:text-white">My List ({myMovies.length})</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:dark:text-gray-200"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3">
            {myMovies.map((movie, index) => (
              <DraggableMovieItem
                key={movie.id}
                movie={movie}
                index={index}
                onRemove={() => removeFromMyList(movie.id)}
                onMove={moveMovie}
              />
            ))}
            {myMovies.length === 0 && (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                Search and add movies to your list
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </main>
  );
}

interface MovieCardProps {
  movie: Movie;
  onAdd: () => void;
  onRemove: () => void;
  isInList: boolean;
}

function MovieCard({ movie, onAdd, onRemove, isInList }: MovieCardProps) {
  const year = movie.release_date?.split('-')[0] || 'Unknown';

  return (
    <div className="movie-card">
      <div className="relative">
        <Image
          src={getImageUrl(movie.poster_path)}
          alt={movie.title}
          width={500}
          height={750}
          className="w-full h-64 object-cover"
        />
        <div className="absolute top-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-sm">
          ⭐ {movie.vote_average.toFixed(1)}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-lg mb-1 line-clamp-2 dark:text-white">{movie.title}</h3>
        <p className="text-gray-600 dark:text-gray-300 text-sm mb-2">{year}</p>
        <p className="text-gray-700 dark:text-gray-300 text-sm mb-4 line-clamp-3">{movie.overview}</p>
        <div className="flex space-x-2">
          {isInList ? (
            <button
              onClick={onRemove}
              className="w-full bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition-colors"
            >
              Remove
            </button>
          ) : (
            <button
              onClick={onAdd}
              className="w-full bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600 transition-colors"
            >
              Add to List
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface DraggableMovieItemProps {
  movie: Movie;
  index: number;
  onRemove: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}

function DraggableMovieItem({ movie, index, onRemove, onMove }: DraggableMovieItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedOver, setDraggedOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOver(true);
  };

  const handleDragLeave = () => {
    setDraggedOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggedOver(false);
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (fromIndex !== index) {
      onMove(fromIndex, index);
    }
  };

  const year = movie.release_date?.split('-')[0] || '';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-move transition-all
        ${isDragging ? 'opacity-50' : ''}
        ${draggedOver ? 'bg-blue-100 dark:bg-blue-900 border-2 border-blue-300 dark:border-blue-600' : ''}
        hover:bg-gray-100 hover:dark:bg-gray-600
      `}
    >
      <div className="text-gray-400 dark:text-gray-500 text-sm">⋮⋮</div>
      <Image
        src={getImageUrl(movie.poster_path)}
        alt={movie.title}
        width={40}
        height={60}
        className="rounded flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate dark:text-white">{movie.title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {year} • ⭐ {movie.vote_average.toFixed(1)}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
} 