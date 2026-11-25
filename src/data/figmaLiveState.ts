import type { FigmaPairing, FigmaPluginStatus } from '../api/figmaPlugin';

export function figmaLiveState(connection: FigmaPluginStatus | undefined, pairing: FigmaPairing | undefined, now: number) {
  const expired = Boolean(connection?.expires_at && Date.parse(connection.expires_at) <= now);
  if (connection?.connected && !expired) return connection.last_received_at ? 'connected' : 'baseline';
  if (expired) return 'expired';
  if (pairing) return Date.parse(pairing.expires_at) <= now ? 'code-expired' : 'waiting';
  return connection?.enabled ? 'waiting' : 'idle';
}

export function remainingTime(expiresAt: string, now: number) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
