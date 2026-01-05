import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './session';

describe('session.ts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(999);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should cancel previous call if called again within delay', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      debouncedFn();
      vi.advanceTimersByTime(500);
      debouncedFn();
      vi.advanceTimersByTime(500);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the debounced function', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      debouncedFn('arg1', 'arg2', 123);
      vi.advanceTimersByTime(1000);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2', 123);
    });

    it('should use the latest arguments when called multiple times', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      debouncedFn('first');
      vi.advanceTimersByTime(500);
      debouncedFn('second');
      vi.advanceTimersByTime(500);
      debouncedFn('third');
      vi.advanceTimersByTime(1000);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('third');
    });

    it('should allow multiple executions after delay', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      debouncedFn('first');
      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith('first');

      debouncedFn('second');
      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith('second');
    });

    it('should work with zero delay', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 0);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(0);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle object arguments', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      const obj = { id: 1, name: 'test' };
      debouncedFn(obj);
      vi.advanceTimersByTime(1000);

      expect(fn).toHaveBeenCalledWith(obj);
    });

    it('should handle array arguments', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      const arr = [1, 2, 3];
      debouncedFn(arr);
      vi.advanceTimersByTime(1000);

      expect(fn).toHaveBeenCalledWith(arr);
    });

    it('should work with functions that return values', () => {
      const fn = vi.fn(() => 'result');
      const debouncedFn = debounce(fn, 1000);

      debouncedFn();
      vi.advanceTimersByTime(1000);

      expect(fn).toHaveBeenCalled();
    });

    it('should handle rapid successive calls', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      for (let i = 0; i < 100; i++) {
        debouncedFn(i);
        vi.advanceTimersByTime(10);
      }

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(99);
    });

    it('should create independent debounced functions', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const debouncedFn1 = debounce(fn1, 1000);
      const debouncedFn2 = debounce(fn2, 500);

      debouncedFn1('fn1');
      debouncedFn2('fn2');

      vi.advanceTimersByTime(500);
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledWith('fn2');

      vi.advanceTimersByTime(500);
      expect(fn1).toHaveBeenCalledWith('fn1');
    });

    it('should handle no arguments', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 1000);

      debouncedFn();
      vi.advanceTimersByTime(1000);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith();
    });

    it('should preserve this context if bound', () => {
      const obj = {
        value: 42,
        method: vi.fn(function (this: { value: number }) {
          return this.value;
        }),
      };

      const debouncedMethod = debounce(obj.method.bind(obj), 1000);
      debouncedMethod();
      vi.advanceTimersByTime(1000);

      expect(obj.method).toHaveBeenCalled();
    });
  });
});
