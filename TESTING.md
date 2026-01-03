# Testing Guide

This document describes the test suite for Frame Rate.

## Overview

The test suite uses [Vitest](https://vitest.dev/), a fast unit test framework optimized for TypeScript and modern JavaScript projects.

## Running Tests

### Run all tests in watch mode
```bash
npm test
```

### Run all tests once
```bash
npm run test:run
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run tests with UI
```bash
npm run test:ui
```

## Test Coverage

The test suite covers the following components:

### 1. Voting Logic (`lib/voting.test.ts`)
- **26 tests** covering ranked-choice voting algorithm
- Tests for:
  - Vote eligibility validation
  - Movie nomination handling
  - Veto mechanics (both movie-level and nomination-level)
  - Ranked-choice winner calculation
  - Multi-round elimination
  - Tie-breaking scenarios
  - Edge cases (single movie, all vetoed, etc.)

Key test scenarios:
- Majority winner in first round
- Multi-round elimination
- Handling vetoed movies
- Using `finalMovies` rankings
- Concurrent nominations
- Tie-breaking with random selection

### 2. Storage Layer (`lib/redis.test.ts`)
- **22 tests** covering both Redis and in-memory fallback modes
- Tests for:
  - Session creation with atomic operations
  - Session updates with optimistic locking
  - Concurrent update handling with mutex locks
  - Pub/sub event emission via EventEmitter
  - Session lifecycle (create → update → publish)
  - Multiple independent sessions
  - Complex nested data structures

Key test scenarios:
- Atomic session creation (prevents duplicate codes)
- Concurrent updates with proper locking
- EventEmitter fan-out for SSE clients
- Session data persistence and retrieval
- Modifier function abort handling

### 3. Session Utilities (`lib/session.test.ts`)
- **13 tests** covering utility functions
- Tests for:
  - Debounce function behavior
  - Argument passing
  - Multiple rapid calls
  - Different delay values
  - Independent debounced instances

## Test Configuration

### Configuration Files

- `vitest.config.ts` - Main Vitest configuration
- `vitest.setup.ts` - Test setup and global mocks

### Environment

Tests run in:
- **Environment**: `happy-dom` (lightweight DOM implementation)
- **Node Environment**: `test`
- **Globals**: Enabled for convenience (`describe`, `it`, `expect`, etc.)

### Coverage

Coverage reports are generated using V8 provider and include:
- Text output (terminal)
- JSON output
- HTML output (viewable in browser)

Coverage excludes:
- `node_modules/`
- Configuration files
- Type definition files
- Test setup files

## Writing Tests

### Test Structure

Tests follow the AAA pattern:
1. **Arrange**: Set up test data and state
2. **Act**: Execute the function under test
3. **Assert**: Verify the results

### Helper Functions

Each test file includes helper functions for creating test data:

#### `voting.test.ts`
- `createMovie(id, title)` - Creates mock movie objects
- `createParticipant(username, movies, options)` - Creates mock participants
- `createSession(participants, options)` - Creates mock sessions

#### `redis.test.ts`
- `createTestSession(code)` - Creates a complete test session

### Best Practices

1. **Isolation**: Each test is independent and doesn't rely on other tests
2. **Cleanup**: `beforeEach` and `afterEach` hooks clear state
3. **Descriptive Names**: Test names clearly describe what they verify
4. **Edge Cases**: Tests cover both happy paths and edge cases
5. **Mock External Dependencies**: Console logs are mocked to reduce noise

## Memory Mode Testing

The storage layer tests use the in-memory fallback mode to avoid requiring a Redis instance. This tests the same code paths used in development mode.

To test with actual Redis:
1. Start Redis: `docker run -d -p 6379:6379 redis:alpine`
2. Set environment: `REDIS_URL=redis://localhost:6379 npm test`

## Continuous Integration

The test suite is designed to run in CI environments:
- Fast execution (< 3 seconds)
- No external dependencies required
- Deterministic results
- Clear error messages

## Adding New Tests

When adding new functionality:

1. Create or update test file in the same directory as the source
2. Use `.test.ts` extension
3. Import necessary helpers and types
4. Write descriptive test cases
5. Run tests to verify: `npm run test:run`
6. Check coverage: `npm run test:coverage`

Example:
```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from './myModule';

describe('myModule.ts', () => {
  describe('myFunction', () => {
    it('should do something specific', () => {
      const result = myFunction(input);
      expect(result).toBe(expectedOutput);
    });
  });
});
```

## Troubleshooting

### Tests failing locally
- Ensure Node.js version matches project requirements
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check that no Redis instance conflicts with tests

### Coverage not generating
- Install coverage provider: `npm install -D @vitest/coverage-v8`
- Run with: `npm run test:coverage`

### Slow test execution
- Use `test:run` for single execution instead of watch mode
- Check for unnecessary `await` calls or timeouts
- Profile with: `npm run test:run -- --reporter=verbose`

## Future Improvements

Potential areas for additional testing:
- API route handlers (integration tests)
- React component testing
- End-to-end testing with Playwright
- TMDB API integration tests (with mocks)
- Letterboxd scraping tests
