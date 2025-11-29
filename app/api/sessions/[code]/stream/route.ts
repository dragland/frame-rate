import { NextRequest } from 'next/server';
import getRedisClient from '@/lib/redis';
import { Session } from '@/lib/types';
import { POLLING_CONFIG } from '@/lib/constants';

/**
 * Server-Sent Events endpoint for real-time session updates
 *
 * Instead of client polling every second, the client opens a single
 * long-lived connection and receives updates only when state changes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;

  if (!code?.trim()) {
    return new Response('Session code is required', { status: 400 });
  }

  const sessionKey = `session:${code.trim().toUpperCase()}`;
  const encoder = new TextEncoder();

  let intervalId: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const redis = getRedisClient();
      let lastStateHash = '';

      const sendUpdate = async () => {
        try {
          const sessionData = await redis.get(sessionKey);

          if (!sessionData) {
            // Session expired or not found - send close event
            controller.enqueue(encoder.encode(`event: session-expired\ndata: {}\n\n`));
            controller.close();
            if (intervalId) clearInterval(intervalId);
            return;
          }

          // Only send if state changed (simple string comparison)
          if (sessionData !== lastStateHash) {
            lastStateHash = sessionData;

            // Parse and add migration for backward compatibility
            const session: Session = JSON.parse(sessionData);
            if (!session.votingPhase) {
              session.votingPhase = 'ranking';
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(session)}\n\n`)
            );
          }
        } catch (error) {
          console.error('SSE stream error:', error);
          controller.enqueue(
            encoder.encode(`event: error\ndata: {"error": "Stream error"}\n\n`)
          );
        }
      };

      // Send initial state immediately
      await sendUpdate();

      // Poll Redis at a fast interval (server-side only)
      // This is more efficient than client polling because:
      // 1. Only sends data when state actually changes
      // 2. No HTTP request overhead for each poll
      intervalId = setInterval(sendUpdate, POLLING_CONFIG.SSE_POLL_INTERVAL_MS);

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        if (intervalId) clearInterval(intervalId);
      });
    },

    cancel() {
      if (intervalId) clearInterval(intervalId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
