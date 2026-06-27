/** Fire-and-forget page view beacon (main · /go only). */
export function recordPageVisit(): void {
  void fetch('/api/analytics/visit', {
    method: 'POST',
    credentials: 'same-origin',
  }).catch(() => {
    // analytics must not block UI
  });
}
