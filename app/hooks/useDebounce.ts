import { useEffect, useState } from 'react';

/**
 * Hook that debounces a value by a specified delay
 * Useful for search inputs and other frequently changing values
 *
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds
 * @returns The debounced value
 *
 * @example
 * const [searchQuery, setSearchQuery] = useState('');
 * const debouncedSearchQuery = useDebounce(searchQuery, 300);
 *
 * useEffect(() => {
 *   // This will only run 300ms after user stops typing
 *   if (debouncedSearchQuery) {
 *     performSearch(debouncedSearchQuery);
 *   }
 * }, [debouncedSearchQuery]);
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes before delay expires
    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, delay]);

  return debouncedValue;
}
