import { useState, useEffect, useRef } from 'react';

// Own clock. App still has TEMPORARY_MESSAGE_MS for the "Thinking..." / error
// bubbles; those two fives are a coincidence, not a shared contract.
export const NOTICE_DURATION_MS = 5000;

export function useNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  // Bumps on every showNotice so the pill remounts even when the sentence is
  // the same: the timer bar starts over, and the live region speaks again.
  const [noticeToken, setNoticeToken] = useState(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(message: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(message);
    setNoticeToken((n) => n + 1);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice(null);
    }, NOTICE_DURATION_MS);
  }

  // A leftover timer would still fire after a later notice replaced this one, and
  // would take that new notice down with it.
  function dismissNotice() {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
    setNotice(null);
  }

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  return { notice, noticeToken, showNotice, dismissNotice };
}
