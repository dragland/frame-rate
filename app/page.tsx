'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchMovies, Movie, getImageUrl } from '../lib/tmdb';
import { getLetterboxdRating } from '../lib/letterboxd';
import { createSession, joinSession, updateMovies, getSession, debounce } from '../lib/session';
import { Session } from '../lib/types';
import { canStartVoting, startVoting } from '../lib/voting';
import VotingModal from './components/VotingModal';
import ProfilePicture from './components/ProfilePicture';
import Image from 'next/image';

type SessionMode = 'solo' | 'host' | 'guest';

function Home() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionMode, setSessionMode] = useState<SessionMode>('solo');
  const [sessionCode, setSessionCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [myMovies, setMyMovies] = useState<Movie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());
  const [justCopied, setJustCopied] = useState(false);
  const [sessionData, setSessionData] = useState<Session | null>(null);
  const [sessionError, setSessionError] = useState<string>('');
  const [showVotingModal, setShowVotingModal] = useState(false);

  const handleStartMovieNight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      setIsLoading(true);
      setSessionError('');
      
      try {
        const response = await createSession(username.trim());
        if (response.success && response.session) {
          setSessionData(response.session);
          setSessionCode(response.session.code);
          setSessionMode('host');
          setIsLoggedIn(true);
        } else {
          setSessionError(response.error || 'Failed to create session');
        }
      } catch (error) {
        setSessionError('Failed to create session');
      }
      
      setIsLoading(false);
    }
  };

  const handleJoinWatchParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && joinCode.trim()) {
      setIsLoading(true);
      setSessionError('');
      
      try {
        const response = await joinSession(joinCode.trim().toUpperCase(), username.trim());
        if (response.success && response.session) {
          setSessionData(response.session);
          setSessionCode(response.session.code);
          setSessionMode('guest');
          setIsLoggedIn(true);
        } else {
          setSessionError(response.error || 'Failed to join session');
        }
      } catch (error) {
        setSessionError('Failed to join session');
      }
      
      setIsLoading(false);
    }
  };



  const copySessionCode = async () => {
    try {
      const shareableUrl = `${window.location.origin}/${sessionCode}`;
      await navigator.clipboard.writeText(shareableUrl);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy session code:', err);
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
      const moviesWithLetterboxd = await Promise.all(
        results.results.slice(0, 5).map(async (movie) => {
          const letterboxdRating = await getLetterboxdRating(movie.id);
          return { ...movie, letterboxdRating };
        })
      );
      setSearchResults(moviesWithLetterboxd);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    }
    setIsLoading(false);
  };

  // Debounced session update
  const debouncedUpdateSession = useCallback(
    debounce(async (movies: Movie[]) => {
      if (sessionData && sessionMode !== 'solo') {
        try {
          await updateMovies(sessionData.code, username, movies);
        } catch (error) {
          console.error('Failed to update session:', error);
        }
      }
    }, 1000),
    [sessionData, sessionMode, username]
  );

  const handleVoteClick = async () => {
    if (sessionData && sessionMode !== 'solo') {
      if (sessionData.votingPhase === 'ranking') {
        // Start voting immediately
        setIsLoading(true);
        try {
          const response = await startVoting(sessionData.code, username);
          if (response.success) {
            setSessionData(response.session);
            setShowVotingModal(true);
          } else {
            setSessionError(response.error || 'Failed to start voting');
          }
        } catch (error) {
          setSessionError('Failed to start voting');
        }
        setIsLoading(false);
      } else {
        setShowVotingModal(true);
      }
    }
  };

  const handleSessionUpdate = (updatedSession: Session) => {
    setSessionData(updatedSession);
  };

  const canVote = sessionData && sessionMode !== 'solo' && sessionData.participants.length >= 2 ? canStartVoting(sessionData) : false;
  const isVotingLocked = sessionData?.votingPhase === 'locked' || sessionData?.votingPhase === 'vetoing' || sessionData?.votingPhase === 'results';

  const addToMyList = (movie: Movie) => {
    if (!myMovies.find(m => m.id === movie.id)) {
      const updatedMovies = [...myMovies, movie];
      setMyMovies(updatedMovies);
      debouncedUpdateSession(updatedMovies);
    }
  };

  const removeFromMyList = (movieId: number) => {
    const updatedMovies = myMovies.filter(m => m.id !== movieId);
    setMyMovies(updatedMovies);
    debouncedUpdateSession(updatedMovies);
  };

  const moveMovie = (fromIndex: number, toIndex: number) => {
    const updatedMovies = [...myMovies];
    const [removed] = updatedMovies.splice(fromIndex, 1);
    updatedMovies.splice(toIndex, 0, removed);
    setMyMovies(updatedMovies);
    debouncedUpdateSession(updatedMovies);
  };

  const isInMyList = (movieId: number) => {
    return myMovies.some(m => m.id === movieId);
  };

  const toggleDescription = (movieId: number) => {
    setExpandedDescriptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(movieId)) {
        newSet.delete(movieId);
      } else {
        newSet.add(movieId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Poll for session updates
  useEffect(() => {
    if (!sessionData || sessionMode === 'solo') return;
    
    const pollSession = async () => {
      try {
        const response = await getSession(sessionData.code);
        if (response.success && response.session) {
          setSessionData(response.session);
          
          // Update my movies from session if they've changed externally
          const myParticipant = response.session.participants.find(p => p.username === username);
          if (myParticipant && JSON.stringify(myParticipant.movies) !== JSON.stringify(myMovies)) {
            setMyMovies(myParticipant.movies);
          }
        }
      } catch (error) {
        console.error('Failed to poll session:', error);
      }
    };
    
    const interval = setInterval(pollSession, 5000); // Poll every 5 seconds (reduced frequency)
    return () => clearInterval(interval);
  }, [sessionData, sessionMode, username]);

  // Auto-fill join code from URL parameter
  const [isFromJoinUrl, setIsFromJoinUrl] = useState(false);
  
  useEffect(() => {
    const joinParam = searchParams.get('join');
    if (joinParam && /^[A-Z]{4}$/.test(joinParam)) {
      setJoinCode(joinParam);
      setIsFromJoinUrl(true);
    }
  }, [searchParams]);

  if (!isLoggedIn) {
    return (
      <main className="h-screen h-dvh flex items-start sm:items-center justify-center p-4 sm:p-8 bg-gradient-to-br from-black to-gray-900 overflow-hidden overscroll-none">
        <div className="max-w-md w-full flex flex-col justify-start sm:justify-center pt-4 sm:pt-0 pb-4 sm:pb-0 min-h-0 max-h-full overflow-hidden">
          <div className="text-center mb-4 sm:mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-white">🎞️ Frame Rate</h1>
          </div>
          
          <div className="space-y-3 sm:space-y-6 flex-shrink-0">
            {/* Username input */}
            <div>
              <input
                type="text"
                placeholder="letterboxd username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full p-4 bg-gray-900 border-2 border-gray-700 text-white rounded-lg focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-400 font-mono text-center lowercase placeholder:text-gray-500 placeholder:normal-case"
                required
              />
            </div>

            {sessionError && (
              <div className="p-3 bg-red-900 border border-red-700 rounded-lg text-red-300 text-sm">
                {sessionError}
              </div>
            )}

            <div className="space-y-3 sm:space-y-4">
              {!isFromJoinUrl && (
                <form onSubmit={handleStartMovieNight}>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white p-3 sm:p-4 rounded-lg transition-colors font-semibold"
                  >
                    {isLoading ? '⏳ Creating...' : '🎬 Start Movie Night'}
                  </button>
                </form>
              )}
              
              <form onSubmit={handleJoinWatchParty} className="space-y-3">
                <input
                  type="text"
                  placeholder="Enter 4-letter code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="w-full p-3 border border-gray-700 bg-gray-900 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono text-lg tracking-wider"
                  required
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white p-3 sm:p-4 rounded-lg transition-colors font-semibold"
                >
                  {isLoading ? '⏳ Joining...' : '🍿 Join Watch Party'}
                </button>
              </form>
            </div>
          </div>
          
          <div className="mt-6 sm:mt-12">
            <a 
              href="https://github.com/dragland" 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center space-x-3 p-3 sm:p-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors font-semibold"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>@dragland</span>
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen h-dvh flex overflow-hidden">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="md:hidden fixed top-4 right-4 z-50 bg-blue-500 text-white p-2 rounded-lg shadow-lg"
      >
        {sidebarOpen ? '✕' : (
          <div className="flex items-center space-x-1">
            {sessionData && (
              <ProfilePicture 
                username={username}
                profilePicture={sessionData.participants.find(p => p.username === username)?.profilePicture}
                size="sm"
              />
            )}
            <span>🍿 {sessionData && sessionMode !== 'solo' ? sessionData.participants.length : myMovies.length}</span>
            {sessionCode && sessionMode !== 'solo' && (
              <span className="text-xs font-mono bg-green-600 px-1 rounded">
                {sessionCode}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-shrink-0 p-4 sm:p-6 md:p-8 md:pr-4 border-b border-gray-800">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold text-white truncate">🎞️ Frame Rate</h1>
              {sessionCode && sessionMode !== 'solo' && (
                <button
                  onClick={copySessionCode}
                  className={`hidden sm:flex items-center space-x-2 px-3 py-1 rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                    justCopied 
                      ? 'bg-green-700' 
                      : 'bg-green-900 hover:bg-green-800'
                  }`}
                  title={justCopied ? 'Copied link!' : 'Click to copy shareable link'}
                >
                  <code className="font-mono text-sm font-bold text-green-300 tracking-wider">
                    {sessionCode}
                  </code>
                                      <span className="text-green-400">
                      {justCopied ? '✓' : '📎'}
                    </span>
                  </button>
                )}
              </div>
              <div className="hidden md:flex items-center space-x-2 font-mono text-orange-400 flex-shrink-0">
              {sessionData && (
                <ProfilePicture 
                  username={username}
                  profilePicture={sessionData.participants.find(p => p.username === username)?.profilePicture}
                  size="sm"
                />
              )}
              <span>{username}</span>
            </div>
          </div>

          {/* Search Section */}
          <div>
            <input
              type="text"
              placeholder="Search for movies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-3 border border-gray-700 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 p-4 sm:p-6 md:p-8 md:pr-4 overflow-y-auto">
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
                isExpanded={expandedDescriptions.has(movie.id)}
                onToggleDescription={() => toggleDescription(movie.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed md:relative top-0 right-0 h-full h-dvh w-80 sm:w-96 bg-gray-900 shadow-xl border-l border-gray-800 z-40
        transform transition-transform duration-300 ease-in-out flex-shrink-0
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        <div className="p-4 sm:p-6 h-full overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">
              🍿 Movie Night {sessionData && sessionMode !== 'solo' ? `(${sessionData.participants.length})` : `(${myMovies.length})`}
            </h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:dark:text-gray-200"
            >
              ✕
            </button>
          </div>

          {/* Mobile copy pill in sidebar */}
          {sessionCode && sessionMode !== 'solo' && (
            <div className="md:hidden mb-4">
              <button
                onClick={copySessionCode}
                className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  justCopied 
                    ? 'bg-green-700' 
                    : 'bg-green-900 hover:bg-green-800'
                }`}
                title={justCopied ? 'Copied link!' : 'Click to copy shareable link'}
              >
                <code className="font-mono text-sm font-bold text-green-300 tracking-wider">
                  {sessionCode}
                </code>
                <span className="text-green-400">
                  {justCopied ? '✓' : '📎'}
                </span>
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0">
            <div className="space-y-3 mb-6">
              {myMovies.map((movie, index) => (
                <DraggableMovieItem
                  key={movie.id}
                  movie={movie}
                  index={index}
                  onRemove={() => removeFromMyList(movie.id)}
                  onMove={moveMovie}
                  showDivider={index === 1 && myMovies.length > 2}
                  isVotingLocked={isVotingLocked}
                />
              ))}
              {myMovies.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  Search and add movies for movie night
                </p>
              )}
            </div>

            {/* Other participants' nominations */}
            {sessionData && sessionMode !== 'solo' && (
              <div className="mb-6">
                <div className="space-y-4">
                  {sessionData.participants
                    .filter(participant => participant.username !== username)
                    .map((participant) => (
                    <div key={participant.username} className="border-l-2 border-gray-700 pl-3">
                      <div className="flex items-center space-x-2 mb-2">
                        <ProfilePicture 
                          username={participant.username}
                          profilePicture={participant.profilePicture}
                          size="sm"
                        />
                        <h4 className="font-medium text-sm text-white">
                          {participant.username}
                        </h4>
                      </div>
                      {participant.movies.length > 0 ? (
                        <div className="space-y-1">
                          {participant.movies.slice(0, 2).map((movie, index) => (
                            <div 
                              key={movie.id} 
                              className={`text-xs text-gray-600 dark:text-gray-400 flex items-center justify-between ${
                                movie.letterboxdRating ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 p-1 -m-1 rounded' : ''
                              }`}
                              onClick={() => {
                                if (movie.letterboxdRating) {
                                  window.open(movie.letterboxdRating.filmUrl, '_blank');
                                }
                              }}
                            >
                              <div className="flex items-center space-x-2 flex-1 min-w-0">
                                <span className="text-orange-500">#{index + 1}</span>
                                <span className="truncate">{movie.title}</span>
                                {movie.release_date?.split('-')[0] && (
                                  <span className="text-gray-400">({movie.release_date.split('-')[0]})</span>
                                )}
                              </div>
                              <div className="flex items-center space-x-1 text-xs flex-shrink-0">
                                {movie.letterboxdRating ? (
                                  <span className="text-green-600 dark:text-green-400">
                                    ⭐{movie.letterboxdRating.rating.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">⭐N/A</span>
                                )}
                                <span className="text-yellow-600 dark:text-yellow-400">
                                  {Math.round(movie.vote_average * 10)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                          No movies yet
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Vote button for group sessions - placed after all nominations */}
            {sessionData && sessionMode !== 'solo' && sessionData.participants.length >= 2 && (
              <div>
                <button 
                  onClick={handleVoteClick}
                  disabled={!canVote}
                  className={`w-full p-4 rounded-lg font-semibold transition-colors ${
                    canVote
                      ? (sessionData?.votingPhase === 'ranking' ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white')
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {sessionData?.votingPhase === 'ranking' && canVote && '🔒 Lock Votes'}
                  {sessionData?.votingPhase === 'locked' && '🔒 Votes Locked'}
                  {sessionData?.votingPhase === 'vetoing' && '🔒 Join Voting'}
                  {sessionData?.votingPhase === 'finalRanking' && '🔒 Final Rankings'}
                  {sessionData?.votingPhase === 'results' && '🏆 See Results'}
                  {sessionData?.votingPhase === 'ranking' && !canVote && 'Need 2 nominations'}
                </button>
              </div>
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

      {/* Voting Modal */}
      {showVotingModal && sessionData && (
        <VotingModal
          session={sessionData}
          username={username}
          onClose={() => setShowVotingModal(false)}
          onSessionUpdate={handleSessionUpdate}
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
  isExpanded: boolean;
  onToggleDescription: () => void;
}

function MovieCard({ movie, onAdd, onRemove, isInList, isExpanded, onToggleDescription }: MovieCardProps) {
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
          <h3 className="font-bold text-lg text-white line-clamp-2">
            {movie.title}{year && <span className="text-gray-400 text-sm font-normal"> ({year})</span>}
          </h3>
        </div>
        
        <button
          onClick={isInList ? onRemove : onAdd}
          className={`w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors mb-3 ${
            isInList 
              ? 'bg-gray-500 hover:bg-gray-600 text-white' 
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isInList ? '− Cut' : '+ Nominate'}
        </button>
        
        <div 
          onClick={onToggleDescription}
          className="cursor-pointer flex-grow mb-3"
        >
          <p className={`text-gray-300 text-sm ${isExpanded ? '' : 'line-clamp-3'}`}>
            {movie.overview}
          </p>
          {movie.overview && movie.overview.length > 150 && (
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

interface DraggableMovieItemProps {
  movie: Movie;
  index: number;
  onRemove: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  showDivider?: boolean;
  isVotingLocked?: boolean;
}

function DraggableMovieItem({ movie, index, onRemove, onMove, showDivider, isVotingLocked = false }: DraggableMovieItemProps) {
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
              Top 2 Picks
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <Home />
    </Suspense>
  );
} 