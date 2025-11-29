import { NextRequest } from 'next/server';
import getRedisClient, {
  getSessionEmitter,
  subscribeToSession,
  unsubscribeFromSession,
} from '@/lib/redis';
import { Session } from '@/lib/types';

/** Heartbeat interval to keep Render connections alive (30s) */
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Server-Sent Events endpoint for real-time session updates
 *
 * Uses Redis pub/sub for instant updates (~50ms latency):
 * - Single shared subscriber connection fans out via EventEmitter
 * - Memory fallback works the same way for local dev
 * - 30s heartbeat keeps Render from killing idle connections
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
  const { code } = params;

  if (!code?.trim()) {
    return new Response('Session code is required', { status: 400 });
  }

  const sessionCode = code.trim().toUpperCase();
  const sessionKey = `session:${sessionCode}`;
  const channel = `session:${sessionCode}`;
  const encoder = new TextEncoder();

  let heartbeatInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const redis = getRedisClient();
      const sessionEmitter = getSessionEmitter();

      // Handler for pub/sub messages
      const handleMessage = (message: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        } catch {
          // Controller closed, cleanup will happen via abort
        }
      };

      // 1. Subscribe FIRST (before fetching state)
      //    This prevents race condition where we miss updates
      await subscribeToSession(sessionCode);

      // 2. Set up EventEmitter listener
      sessionEmitter.on(channel, handleMessage);

      // 3. THEN fetch current state (catches any updates during setup)
      const sessionData = await redis.get(sessionKey);

      if (!sessionData) {
        // Session not found - send close event and cleanup
        controller.enqueue(encoder.encode(`event: session-expired\ndata: {}\n\n`));
        sessionEmitter.off(channel, handleMessage);
        await unsubscribeFromSession(sessionCode).catch(() => {});
        controller.close();
        return;
      }

      // Send initial state with migration
      const session: Session = JSON.parse(sessionData);
      if (!session.votingPhase) {
        session.votingPhase = 'ranking';
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(session)}\n\n`));

      // 4. Start heartbeat to keep Render connection alive
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // Controller closed
        }
      }, HEARTBEAT_INTERVAL_MS);

      // 5. Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        sessionEmitter.off(channel, handleMessage);
        unsubscribeFromSession(sessionCode).catch(() => {});
      });
    },

    cancel() {
      // Backup cleanup if start() fails
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    },
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
