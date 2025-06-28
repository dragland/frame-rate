'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SessionCodePage({ params }: { params: { code: string } }) {
  const router = useRouter();
  
  useEffect(() => {
    const { code } = params;
    if (code && /^[A-Z]{4}$/.test(code)) {
      router.replace(`/?join=${code}`);
    } else {
      router.replace('/');
    }
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Joining session...</p>
      </div>
    </div>
  );
} 