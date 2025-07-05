'use client';

import React from 'react';

interface BackgroundInstructionsProps {
  isVisible: boolean;
  sessionCode?: string;
  onCopySessionCode?: () => void;
  justCopied?: boolean;
}

export default function BackgroundInstructions({ 
  isVisible, 
  sessionCode, 
  onCopySessionCode, 
  justCopied 
}: BackgroundInstructionsProps) {
  if (!isVisible) return null;

  return (
    <div className="mb-8 opacity-50 flex justify-center">
      <div className="max-w-md w-full">
        <div className="space-y-3 text-gray-400 text-sm">
          <ul className="space-y-2 text-left">
            <li className="flex items-center space-x-3">
              <span className="text-blue-400">🔗</span>
              <span>Share code to start a movie night</span>
            </li>
            
            <li className="flex items-center space-x-3">
              <span className="text-orange-400">🎬</span>
              <span>Search & nominate your top films</span>
            </li>
            
            <li className="flex items-center space-x-3">
              <span className="text-yellow-400">🔒</span>
              <span>Lock in everyone's top 2 picks</span>
            </li>
            
            <li className="flex items-center space-x-3">
              <span className="text-red-400">✋</span>
              <span>Veto & rank the final films</span>
            </li>
            
            <li className="flex items-center space-x-3">
              <span className="text-green-400">🍿</span>
              <span>Enjoy your movie night together!</span>
            </li>
          </ul>
          
          {sessionCode && onCopySessionCode && (
            <div className="pt-2 md:hidden">
              <button
                onClick={onCopySessionCode}
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
        </div>
      </div>
    </div>
  );
} 