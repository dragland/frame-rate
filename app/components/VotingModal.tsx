'use client';

import React, { useState } from 'react';
import { Session, VotingPhase } from '../../lib/types';
import { Movie, getImageUrl } from '../../lib/tmdb';
import { getAllMovies, getVetoedMovies, getRemainingMovies, getAllMovieNominations, getRemainingNominations, getVetoedNominations, startVoting, vetoMovie, vetoNomination, updateFinalMovies } from '../../lib/voting';
import ProfilePicture from './ProfilePicture';
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
  const allNominations = getAllMovieNominations(session);
  const remainingNominations = getRemainingNominations(session);
  const vetoedNominations = getVetoedNominations(session);
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

  const handleVetoNomination = async (nominationId: string) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await vetoNomination(session.code, username, nominationId);
      if (response.success) {
        onSessionUpdate(response.session);
      } else {
        setError(response.error || 'Failed to veto nomination');
      }
    } catch (err) {
      setError('Failed to veto nomination');
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
              <h3 className="text-xl font-semibold mb-4 text-white">Rankings Locked!</h3>
              <p className="text-gray-400 mb-6">
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
        <h3 className="text-xl font-semibold mb-2 text-white flex items-center justify-center space-x-2">
          <span className="text-2xl">💀</span>
          <span>Veto Phase</span>
        </h3>
        {!hasUserVetoed && (
          <p className="text-gray-400 text-sm">
            Choose one movie to eliminate from the voting pool
          </p>
        )}
        
        {/* Veto progress - only show if user hasn't vetoed yet */}
        {!hasUserVetoed && (
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
        )}
      </div>

      {hasUserVetoed ? (
        <div className="text-center py-8">
          <div className="text-green-600 dark:text-green-400 mb-2">✓ Vetoed "{vetoedMovies.find(m => m.id === userVetoedMovie)?.title || 'Unknown'}"</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for others to complete their vetoes...
          </div>
        </div>
      ) : (
        <div>
          {vetoedNominations.length > 0 && (
            <div className="mb-4 p-2 bg-red-50 dark:bg-red-900 rounded text-xs text-red-700 dark:text-red-300">
              Vetoed nominations: {vetoedNominations.length}
            </div>
          )}
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {remainingNominations.map((nomination) => (
              <div
                key={nomination.nominationId}
                className="flex items-center space-x-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-pointer transition-all"
                onClick={() => handleVetoNomination(nomination.nominationId)}
              >
                <Image
                  src={getImageUrl(nomination.poster_path)}
                  alt={nomination.title}
                  width={40}
                  height={60}
                  className="rounded flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate text-white">{nomination.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-2">
                    <span>{nomination.release_date?.split('-')[0]}</span>
                    {nomination.letterboxdRating ? (
                      <a
                        href={nomination.letterboxdRating.filmUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ⭐ {nomination.letterboxdRating.rating.toFixed(1)}
                      </a>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">⭐ N/A</span>
                    )}
                    <span className="text-yellow-600 dark:text-yellow-400">{Math.round(nomination.vote_average * 10)}%</span>
                  </div>
                </div>
                <button className="text-red-500 hover:text-red-700 px-3 py-1 rounded font-semibold flex items-center space-x-1">
                  <ProfilePicture 
                    username={nomination.nominatedBy}
                    profilePicture={session.participants.find(p => p.username === nomination.nominatedBy)?.profilePicture}
                    size="sm"
                  />
                  <span>Veto</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderFinalRankingPhase = () => (
    <div>
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">🎯</div>
        <h3 className="text-xl font-semibold mb-2 text-white">Cast final rankings</h3>
        
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
          <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
            {finalMovies.map((movie, index) => (
              <div
                key={movie.id}
                draggable
                onDragStart={(e) => handleDragStart(e, movie.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                className="flex items-center space-x-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 cursor-move transition-all"
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
                    <span>{movie.release_date?.split('-')[0]}</span>
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
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  #{index + 1}
                </div>
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
        <div className="text-6xl mb-4">🥇</div>
        
        <h3 className="text-2xl font-bold mb-4 text-green-600 dark:text-green-400">
          {winner.title} ({winner.release_date?.split('-')[0] || 'Unknown'})
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
            <div className="absolute top-2 right-2">
              {winner.letterboxdRating ? (
                <a
                  href={winner.letterboxdRating.filmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 bg-opacity-90 text-white px-2 py-1 rounded text-sm flex items-center hover:bg-blue-700 transition-colors space-x-1"
                >
                  <span>⭐ {winner.letterboxdRating.rating.toFixed(1)}</span>
                  <span>{Math.round(winner.vote_average * 10)}%</span>
                </a>
              ) : (
                <div className="bg-blue-600 bg-opacity-90 text-white px-2 py-1 rounded text-sm flex items-center">
                  {Math.round(winner.vote_average * 10)}%
                </div>
              )}
            </div>
          </div>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            {winner.overview}
          </p>
        </div>

        {rounds.length > 1 && (
          <div className="mt-6 text-left">
            <h4 className="font-semibold mb-3 text-center text-white">Voting Rounds</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {rounds.map((round) => (
                <div key={round.round} className="text-sm p-2 bg-gray-800 rounded">
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

        <a
          href="plex://"
          className="mt-6 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold inline-block"
        >
          🎬 Watch Now
        </a>

        {session.votingResults.tieBreaking?.isTieBreaker && (
          <div className="mt-4 p-2 bg-orange-900 border border-orange-700 rounded-lg">
            <div className="text-orange-300 text-sm font-medium text-center">
              🪙 took executive action for tie 🪙
            </div>
            {session.votingResults.tieBreaking.tiedMovies.length > 0 && (
              <div className="text-orange-400 text-xs text-center mt-1">
                Tied between: {session.votingResults.tieBreaking.tiedMovies.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderRankingPhase = () => (
    <div className="text-center">
      <div className="text-6xl mb-4">🗳️</div>
      <h3 className="text-xl font-semibold mb-4 text-white">Ready to Vote?</h3>
      <p className="text-gray-400 mb-6">
        Once you lock votes, all movie rankings will be locked and no one can make changes.
      </p>
              <div className="mb-6 p-4 bg-blue-900 border border-blue-800 rounded-lg">
          <h4 className="font-semibold mb-2 text-white">How it works:</h4>
          <ol className="text-left text-sm text-gray-400 space-y-1">
          <li>1. Only your top 2 picks enter the voting pool</li>
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
      <div className="bg-gray-900 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-end mb-6">
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          )}

          {renderContent()}
        </div>
      </div>
    </div>
  );
} 