import { describe, expect, it } from 'vitest';
import {
  isMovieArrayPayload,
  isPositiveInteger,
  isValidSessionCode,
  isValidUsername,
  normalizeSessionCode,
  normalizeUsername,
} from './validation';

describe('validation.ts', () => {
  it('normalizes and validates session codes', () => {
    expect(normalizeSessionCode(' abcd ')).toBe('ABCD');
    expect(isValidSessionCode('abcd')).toBe(true);
    expect(isValidSessionCode('abc')).toBe(false);
    expect(isValidSessionCode('abc1')).toBe(false);
  });

  it('normalizes and validates usernames', () => {
    expect(normalizeUsername(' Alice_1 ')).toBe('alice_1');
    expect(isValidUsername('Alice_1')).toBe(true);
    expect(isValidUsername('alice-1')).toBe(false);
    expect(isValidUsername('')).toBe(false);
  });

  it('validates positive integers', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger('1')).toBe(false);
  });

  it('validates movie arrays by required fields', () => {
    expect(isMovieArrayPayload([{ id: 1, title: 'Movie' }])).toBe(true);
    expect(isMovieArrayPayload([{ id: 1, title: '' }])).toBe(false);
    expect(isMovieArrayPayload([{ id: '1', title: 'Movie' }])).toBe(false);
    expect(isMovieArrayPayload({ id: 1, title: 'Movie' })).toBe(false);
  });
});
