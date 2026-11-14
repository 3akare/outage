// Event time = server receive time minus the phone's monotonic elapsed time (event-time.md, R3).
// The phone's wall clock is never an input. `elapsedMs` is validated before this is called.
export function eventTimeMs(receiveTimeMs: number, elapsedMs: number): number {
  return receiveTimeMs - elapsedMs;
}
