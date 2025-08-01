'use client';

import React, { useState } from 'react';
import { Session, VotingPhase } from '../../lib/types';
import { Movie, getImageUrl, formatRuntime } from '../../lib/tmdb';
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
            Veto one film from pool
          </p>
        )}
        
        {/* Veto progress with profile pictures */}
        <div className="mt-4">
          <div className="flex justify-center items-center space-x-1 flex-wrap gap-1">
            {session.participants.map((participant) => (
              <div
                key={participant.username}
                className={`relative ${participant.hasVoted ? 'opacity-100' : 'opacity-40'}`}
                title={participant.hasVoted ? `${participant.username} - Voted` : `${participant.username} - Waiting`}
              >
                <ProfilePicture 
                  username={participant.username}
                  profilePicture={participant.profilePicture}
                  size="sm"
                />
                {participant.hasVoted && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-gray-900 flex items-center justify-center">
                    <span className="text-[8px] text-white">✓</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hasUserVetoed ? (
        <div className="text-center py-8">
          <div className="text-green-600 dark:text-green-400">✓ Vetoed "{vetoedMovies.find(m => m.id === userVetoedMovie)?.title || 'Unknown'}"</div>
        </div>
      ) : (
        <div>
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
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-x-2">
                    {nomination.release_date?.split('-')[0] && <span>{nomination.release_date.split('-')[0]}</span>}
                    {nomination.runtime && <span>• {formatRuntime(nomination.runtime)}</span>}
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
        <h3 className="text-xl font-semibold mb-2 text-white flex items-center justify-center space-x-2">
          <span className="text-2xl">🎯</span>
          <span>Ranked Choice</span>
        </h3>
        {!hasUserFinalRanked && (
          <p className="text-gray-400 text-sm">
            Order films for final vote
          </p>
        )}
        
        {/* Final ranking progress with profile pictures */}
        <div className="mt-4">
          <div className="flex justify-center items-center space-x-1 flex-wrap gap-1">
            {session.participants.map((participant) => {
              const hasCompleted = participant.finalMovies && participant.finalMovies.length > 0;
              return (
                <div
                  key={participant.username}
                  className={`relative ${hasCompleted ? 'opacity-100' : 'opacity-40'}`}
                  title={hasCompleted ? `${participant.username} - Completed` : `${participant.username} - Waiting`}
                >
                  <ProfilePicture 
                    username={participant.username}
                    profilePicture={participant.profilePicture}
                    size="sm"
                  />
                  {hasCompleted && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-gray-900 flex items-center justify-center">
                      <span className="text-[8px] text-white">✓</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {hasUserFinalRanked ? (
        <div className="text-center py-8">
          <div className="text-green-600 dark:text-green-400">✓ Rankings locked in!</div>
        </div>
      ) : (
        <div>
          <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
            {finalMovies.map((movie, index) => {
              const year = movie.release_date?.split('-')[0];
              return (
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
                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  #{index + 1}
                </div>
              </div>
              );
            })}
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
    const year = winner.release_date?.split('-')[0];

    return (
      <div className="text-center">
        <div className="text-6xl mb-4">
          {session.votingResults.tieBreaking?.isTieBreaker ? '🪙' : '🥇'}
        </div>
        
        <div className="mb-6">
          {/* Movie info and title above poster */}
          <div className="mb-4">
            <h3 className="text-2xl font-bold text-green-600 dark:text-green-400 line-clamp-2 mb-2">
              {winner.title}
            </h3>
            {(year || winner.runtime || winner.director) && (
              <div className="text-gray-400 text-base space-x-2">
                {year && <span>{year}</span>}
                {winner.runtime && <span>• {formatRuntime(winner.runtime)}</span>}
                {winner.director && <span>• {winner.director}</span>}
              </div>
            )}
          </div>
          
          {/* Poster with new rating overlay style */}
          <div className="relative w-48 h-72 mx-auto mb-4">
            <Image
              src={getImageUrl(winner.poster_path)}
              alt={winner.title}
              fill
              className="object-cover rounded-lg shadow-lg"
              sizes="192px"
            />
            {/* Updated rating overlay to match new card style */}
            <div className="absolute bottom-2 right-2">
              {winner.letterboxdRating ? (
                <a
                  href={winner.letterboxdRating.filmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 text-white px-3 py-2 rounded text-sm flex items-center space-x-2 hover:bg-blue-700 transition-colors"
                >
                  <span className="text-green-400">⭐ {winner.letterboxdRating.rating.toFixed(1)}</span>
                  <span className="text-yellow-400">{Math.round(winner.vote_average * 10)}%</span>
                </a>
              ) : (
                <div className="bg-blue-600 text-white px-3 py-2 rounded text-sm flex items-center">
                  <span className="text-yellow-400">{Math.round(winner.vote_average * 10)}%</span>
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
          className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold inline-block flex items-center justify-center space-x-2"
        >
          <div className="flex items-center space-x-1">
            {session.participants.map((participant, index) => (
              <div
                key={participant.username}
                className="relative"
                title={participant.username}
              >
                <ProfilePicture 
                  username={participant.username}
                  profilePicture={participant.profilePicture}
                  size="sm"
                />
              </div>
            ))}
          </div>
          <span>Show Time!</span>
        </a>
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