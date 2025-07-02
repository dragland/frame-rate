import React, { useState } from 'react';
import Image from 'next/image';

interface ProfilePictureProps {
  username: string;
  profilePicture?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function ProfilePicture({ 
  username, 
  profilePicture, 
  size = 'sm', 
  className = '' 
}: ProfilePictureProps) {
  const [imageError, setImageError] = useState(false);
  
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8', 
    lg: 'w-12 h-12'
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  };

  const initials = username
    .split('')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (profilePicture && !imageError) {
    return (
      <div className={`${sizeClasses[size]} relative rounded-full overflow-hidden flex-shrink-0 ${className}`}>
        <Image
          src={profilePicture}
          alt={`${username}'s profile`}
          fill
          className="object-cover"
          sizes={size === 'sm' ? '24px' : size === 'md' ? '32px' : '48px'}
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // Fallback to initials (either no image or image failed to load)
  return (
    <div className={`${sizeClasses[size]} bg-gradient-to-br from-gray-400 to-gray-600 text-white font-bold ${textSizeClasses[size]} rounded-full flex items-center justify-center flex-shrink-0 ${className}`}>
      {initials}
    </div>
  );
} 