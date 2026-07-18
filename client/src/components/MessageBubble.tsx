import { marked } from 'marked';
import styles from './MessageBubble.module.css';
import type { Message } from '../types';

interface MessageBubbleProps {
    msg: Message;
    isUser: boolean;
    onDelete: () => void;
    onRetry?: () => void;
}

export default function MessageBubble({ msg, isUser, onDelete, onRetry }: MessageBubbleProps) {
    const rawText = msg.parts[0].text;
    const htmlContent = { __html: isUser ? rawText : marked.parse(rawText) as string };

    return (
        <div className={`${styles.messageWrapper} ${isUser ? styles.userWrapper : styles.geminiWrapper}`}>
            <div
                className={`${styles.messageBubble} ${isUser ? styles.userBubble : styles.geminiBubble}`}
                dangerouslySetInnerHTML={htmlContent}
            />
            <div className={styles.messageActions}>
                {onRetry && !msg.isTemporary && (
                    <button className={styles.actionButton} title="Reintentar mensaje" onClick={onRetry}>
                        <svg width="16" height="16">
                            <use xlinkHref="#icon-retry" />
                        </svg>
                    </button>
                )}
                <button className={styles.actionButton} title="Borrar mensaje" onClick={onDelete} disabled={msg.isTemporary}>
                    <svg width="16" height="16">
                        <use xlinkHref="#icon-trash" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
