import { NOTICE_DURATION_MS } from './useNotice';

interface AppNoticeProps {
  notice: string | null;
  noticeToken: number;
  onDismiss: () => void;
}

export default function AppNotice({ notice, noticeToken, onDismiss }: AppNoticeProps) {
  if (!notice) return null;

  return (
    <div key={noticeToken} className="app-notice" role="status" aria-live="polite">
      <span className="app-notice-text">{notice}</span>
      <button
        type="button"
        className="app-notice-dismiss"
        aria-label="Dismiss notice"
        onClick={onDismiss}
      >
        <svg width="14" height="14" aria-hidden="true">
          <use xlinkHref="#icon-x" />
        </svg>
      </button>
      <div
        className="app-notice-timer"
        data-notice-token={noticeToken}
        style={{ animationDuration: `${NOTICE_DURATION_MS}ms` }}
      />
    </div>
  );
}
