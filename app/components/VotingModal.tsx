'use client';

import React, { useState } from 'react';
import { Session, VotingPhase } from '../../lib/types';
import { Movie, getImageUrl } from '../../lib/tmdb';
import { getAllMovies, getVetoedMovies, getRemainingMovies, startVoting, vetoMovie, updateFinalMovies } from '../../lib/voting';
import Image from 'next/image';

interface VotingModalProps {
  session: Session;
  username: string;
  onClose: () => void;
  onSessionUpdate: (session: Session) => void;
}

export default function VotingModal({ session, username, onClose, onSessionUpdate }: VotingModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [finalMovies, setFinalMovies] = useState<Movie[]>([]);
  
  const allMovies = getAllMovies(session);
  const vetoedMovies = getVetoedMovies(session);
  const remainingMovies = getRemainingMovies(session);
  const currentUser = session.participants.find(p => p.username === username);
  const hasUserVetoed = currentUser?.hasVoted || false;
  const userVetoedMovie = currentUser?.vetoedMovieId;
  const hasUserFinalRanked = currentUser?.finalMovies && currentUser.finalMovies.length > 0;

  // Initialize final movies if not already set
  React.useEffect(() => {
    if (session.votingPhase === 'finalRanking' && finalMovies.length === 0 && remainingMovies.length > 0) {
      // Initialize with remaining movies in original order for this user
      const userOriginalMovies = currentUser?.movies || [];
      const orderedRemaining = userOriginalMovies.filter(movie => 
        remainingMovies.some(rm => rm.id === movie.id)
      );
      // Add any remaining movies that weren't in user's original list
      const missingMovies = remainingMovies.filter(movie => 
        !orderedRemaining.some(om => om.id === movie.id)
      );
      setFinalMovies([...orderedRemaining, ...missingMovies]);
    }
  }, [session.votingPhase, remainingMovies, currentUser?.movies, finalMovies.length]);

  const handleStartVoting = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await startVoting(session.code, username);
      if (response.success) {
        onSessionUpdate(response.session);
      } else {
        setError(response.error || 'Failed to start voting');
      }
    } catch (err) {
      setError('Failed to start voting');
    }
    
    setIsLoading(false);
  };

  const handleVetoMovie = async (movieId: number) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await vetoMovie(session.code, username, movieId);
      if (response.success) {
        onSessionUpdate(response.session);
      } else {
        setError(response.error || 'Failed to veto movie');
      }
    } catch (err) {
      setError('Failed to veto movie');
    }
    
    setIsLoading(false);
  };

  const handleUpdateFinalMovies = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await updateFinalMovies(session.code, username, finalMovies);
      if (response.success) {
        onSessionUpdate(response.session);
      } else {
        setError(response.error || 'Failed to update final rankings');
      }
    } catch (err) {
      setError('Failed to update final rankings');
    }
    
    setIsLoading(false);
  };

  const handleDragStart = (e: React.DragEvent, movieId: number) => {
    e.dataTransfer.setData('text/plain', movieId.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const draggedMovieId = parseInt(e.dataTransfer.getData('text/plain'));
    const draggedIndex = finalMovies.findIndex(m => m.id === draggedMovieId);
    
    if (draggedIndex === -1) return;
    
    const newMovies = [...finalMovies];
    const [removed] = newMovies.splice(draggedIndex, 1);
    newMovies.splice(targetIndex, 0, removed);
    setFinalMovies(newMovies);
  };

  const renderLockedPhase = () => (
    <div className="text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h3 className="text-xl font-semibold mb-4 dark:text-white">Rankings Locked!</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        All movie rankings have been locked. Now it's time to eliminate movies.
      </p>
      <p className="text-sm text-orange-600 dark:text-orange-400 mb-6">
        Each person gets to veto one movie. Choose wisely!
      </p>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        Waiting for the veto phase to begin...
      </div>
    </div>
  );

  const renderVetoingPhase = () => (
    <div>
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">❌</div>
        <h3 className="text-xl font-semibold mb-2 dark:text-white">Veto Phase</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Choose one movie to eliminate from the final vote
        </p>
        
        {/* Veto progress */}
        <div className="mt-4 text-sm">
          <div className="text-gray-500 dark:text-gray-400">
            {session.participants.filter(p => p.hasVoted).length} / {session.participants.length} vetoed
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
            <div 
              className="bg-red-500 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${(session.participants.filter(p => p.hasVoted).length / session.participants.length) * 100}%` 
              }}
            />
          </div>
        </div>
      </div>

      {hasUserVetoed ? (
        <div className="text-center py-8">
          <div className="text-green-600 dark:text-green-400 mb-2">✓ You have vetoed a movie</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for others to complete their vetoes...
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {allMovies.map((movie) => (
            <div
              key={movie.id}
              className="flex items-center space-x-3 p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              onClick={() => handleVetoMovie(movie.id)}
            >
              <div className="relative w-12 h-18 flex-shrink-0">
                <Image
                  src={getImageUrl(movie.poster_path)}
                  alt={movie.title}
                  fill
                  className="object-cover rounded"
                  sizes="48px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate dark:text-white">{movie.title}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {movie.release_date?.split('-')[0]}
                </p>
              </div>
              <button className="text-red-500 hover:text-red-700 px-3 py-1 rounded">
                ❌ Veto
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderFinalRankingPhase = () => (
    <div>
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🎯</div>
        <h3 className="text-xl font-semibold mb-2 dark:text-white">Final Rankings</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Now rank the remaining movies in your final order of preference
        </p>
        
        {/* Final ranking progress */}
        <div className="mt-4 text-sm">
          <div className="text-gray-500 dark:text-gray-400">
            {session.participants.filter(p => p.finalMovies && p.finalMovies.length > 0).length} / {session.participants.length} completed final rankings
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ 
                width: `${(session.participants.filter(p => p.finalMovies && p.finalMovies.length > 0).length / session.participants.length) * 100}%` 
              }}
            />
          </div>
        </div>
      </div>

      {hasUserFinalRanked ? (
        <div className="text-center py-8">
          <div className="text-green-600 dark:text-green-400 mb-2">✓ You have completed your final rankings</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for others to finish their final rankings...
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg text-sm">
            <div className="font-medium mb-1 dark:text-white">💡 Drag to reorder</div>
            <div className="text-gray-600 dark:text-gray-400">
              These are the movies left after vetoing. Drag them to your final preferred order.
            </div>
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
            {finalMovies.map((movie, index) => (
              <div
                key={movie.id}
                draggable
                onDragStart={(e) => handleDragStart(e, movie.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className="flex items-center space-x-3 p-3 border dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-move transition-colors"
              >
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 w-6">
                  #{index + 1}
                </div>
                <div className="relative w-12 h-18 flex-shrink-0">
                  <Image
                    src={getImageUrl(movie.poster_path)}
                    alt={movie.title}
                    fill
                    className="object-cover rounded"
                    sizes="48px"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate dark:text-white">{movie.title}</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {movie.release_date?.split('-')[0]}
                  </p>
                </div>
                <div className="text-gray-400">⋮⋮</div>
              </div>
            ))}
          </div>
          
          <button
            onClick={handleUpdateFinalMovies}
            disabled={isLoading || finalMovies.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white p-3 rounded-lg font-semibold transition-colors"
          >
            {isLoading ? '⏳ Locking...' : '🔒 Lock Final Votes'}
          </button>
        </div>
      )}
    </div>
  );

  const renderResultsPhase = () => {
    if (!session.votingResults) return null;

    const { winner, rounds } = session.votingResults;

    return (
      <div className="text-center">
        <div className="text-6xl mb-4">🏆</div>
        <h3 className="text-2xl font-bold mb-4 text-green-600 dark:text-green-400">
          We're Watching: {winner.title}
        </h3>
        
        <div className="mb-6">
          <div className="relative w-48 h-72 mx-auto mb-4">
            <Image
              src={getImageUrl(winner.poster_path)}
              alt={winner.title}
              fill
              className="object-cover rounded-lg shadow-lg"
              sizes="192px"
            />
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mx-auto">
            {winner.overview}
          </p>
        </div>

        {rounds.length > 1 && (
          <div className="mt-6 text-left">
            <h4 className="font-semibold mb-3 text-center dark:text-white">Voting Rounds</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {rounds.map((round) => (
                <div key={round.round} className="text-sm p-2 bg-gray-50 dark:bg-gray-700 rounded">
                  <span className="font-medium">Round {round.round}:</span>
                  {round.eliminated && (
                    <span className="text-red-600 dark:text-red-400 ml-2">
                      Eliminated "{round.eliminated.title}"
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold"
        >
          🎬 Let's Watch!
        </button>
      </div>
    );
  };

  const renderRankingPhase = () => (
    <div className="text-center">
      <div className="text-6xl mb-4">🗳️</div>
      <h3 className="text-xl font-semibold mb-4 dark:text-white">Ready to Vote?</h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        Once you lock votes, all movie rankings will be locked and no one can make changes.
      </p>
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900 rounded-lg">
        <h4 className="font-semibold mb-2 dark:text-white">How it works:</h4>
        <ol className="text-left text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>1. Rankings get locked - no more changes</li>
          <li>2. Everyone picks one movie to eliminate</li>
          <li>3. Final rankings determine the winner</li>
        </ol>
      </div>
      <button
        onClick={handleStartVoting}
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white p-4 rounded-lg font-semibold transition-colors"
      >
        {isLoading ? '⏳ Locking...' : '🔒 Lock Votes'}
      </button>
    </div>
  );

  const renderContent = () => {
    switch (session.votingPhase) {
      case 'ranking':
        return renderRankingPhase();
      case 'locked':
        return renderLockedPhase();
      case 'vetoing':
        return renderVetoingPhase();
      case 'finalRanking':
        return renderFinalRankingPhase();
      case 'results':
        return renderResultsPhase();
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold dark:text-white">Movie Night Voting</h2>
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 bg-white dark:bg-gray-800 bg-opacity-75 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}

          {renderContent()}
        </div>
      </div>
    </div>
  );
} 