import type { CapturedScholarship } from '../core/pageCapture';

export const PENDING_CAPTURE_KEY = 'nexus:pending-capture-review';

export async function setPendingCaptureReview(captured: CapturedScholarship): Promise<void> {
  await chrome.storage.session.set({ [PENDING_CAPTURE_KEY]: captured });
}

export async function takePendingCaptureReview(): Promise<CapturedScholarship | undefined> {
  const stored = await chrome.storage.session.get(PENDING_CAPTURE_KEY);
  const captured = stored[PENDING_CAPTURE_KEY] as CapturedScholarship | undefined;
  if (captured) await chrome.storage.session.remove(PENDING_CAPTURE_KEY);
  return captured;
}
