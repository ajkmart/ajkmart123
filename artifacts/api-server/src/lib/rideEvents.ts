import { EventEmitter } from "node:events";

const rideEmitter = new EventEmitter();

/* Allow up to 1000 listeners total — enough for many concurrent SSE connections */
rideEmitter.setMaxListeners(1000);

/**
 * Signal that a ride's state has changed.
 * All active SSE streams for this ride will immediately fetch fresh data and push it.
 */
export function emitRideUpdate(rideId: string): void {
  rideEmitter.emit(`ride:update:${rideId}`);
}

/**
 * Subscribe to ride update signals for a specific ride.
 * Returns an unsubscribe function — call it on SSE close to prevent memory leaks.
 */
export function onRideUpdate(rideId: string, listener: () => void): () => void {
  const event = `ride:update:${rideId}`;
  rideEmitter.on(event, listener);
  return () => rideEmitter.off(event, listener);
}
