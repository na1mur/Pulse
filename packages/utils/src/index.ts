// Helper to calculate timer duration
export function calculateDuration(startedAt: number, elapsedBeforeCurrentRun: number): number {
  return elapsedBeforeCurrentRun + (Date.now() - startedAt);
}

// Format milliseconds into HH:MM:SS
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => String(num).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
