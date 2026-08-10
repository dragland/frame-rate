'use client';

import ProfilePicture from './ProfilePicture';

/** Max avatars shown before collapsing into "+N" */
const MAX_WATCHLIST_AVATARS = 3;

export interface WatchlistedByEntry {
  username: string;
  profilePicture?: string | null;
}

interface WatchlistAvatarStackProps {
  /** Participants who have the film on their Letterboxd watchlist */
  participants: WatchlistedByEntry[];
  /** Ring color matching the background the stack sits on */
  ringClassName: string;
}

export default function WatchlistAvatarStack({ participants, ringClassName }: WatchlistAvatarStackProps) {
  if (participants.length === 0) return null;

  const names = participants.map(p => p.username).join(', ');
  const label = `On the watchlist of: ${names}`;

  return (
    <div className="flex items-center" role="img" aria-label={label} title={label}>
      <div className="flex -space-x-2">
        {participants.slice(0, MAX_WATCHLIST_AVATARS).map(participant => (
          <ProfilePicture
            key={participant.username}
            username={participant.username}
            profilePicture={participant.profilePicture}
            size="sm"
            className={`ring-1 ${ringClassName}`}
          />
        ))}
      </div>
      {participants.length > MAX_WATCHLIST_AVATARS && (
        <span className="text-xs ml-1 text-gray-200">
          +{participants.length - MAX_WATCHLIST_AVATARS}
        </span>
      )}
    </div>
  );
}
