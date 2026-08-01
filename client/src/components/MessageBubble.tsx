import { useState } from 'react';
import { marked } from 'marked';
import styles from './MessageBubble.module.css';
import type { Message } from '../types';

function renderModelHtml(text: string): string {
    const html = marked.parse(text) as string;
    return html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
}

interface MessageBubbleProps {
    msg: Message;
    isUser: boolean;
    onDelete: () => void;
    onRetry?: () => void;
}

export default function MessageBubble({ msg, isUser, onDelete, onRetry }: MessageBubbleProps) {
    const [copied, setCopied] = useState(false);
    const rawText = msg.parts[0]?.text || '';
    const htmlContent = { __html: isUser ? rawText : renderModelHtml(rawText) };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(rawText);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    return (
        <div className={`${styles.messageWrapper} ${isUser ? styles.userWrapper : styles.geminiWrapper}`}>
            <div
                className={`${styles.messageBubble} ${isUser ? styles.userBubble : styles.geminiBubble}`}
                data-message-bubble
                dangerouslySetInnerHTML={htmlContent}
            />
            <div className={styles.messageActions}>
                <button
                    className={styles.actionButton}
                    title={copied ? "Copied!" : "Copy message"}
                    onClick={handleCopy}
                >
                    <svg width="16" height="16">
                        <use xlinkHref={copied ? "#icon-confirm" : "#icon-copy"} />
                    </svg>
                </button>
                {onRetry && !msg.isTemporary && (
                    <button className={styles.actionButton} title="Retry message" onClick={onRetry}>
                        <svg width="16" height="16">
                            <use xlinkHref="#icon-retry" />
                        </svg>
                    </button>
                )}
                <button className={styles.actionButton} title="Delete message" onClick={onDelete} disabled={msg.isTemporary}>
                    <svg width="16" height="16">
                        <use xlinkHref="#icon-trash" />
                    </svg>
                </button>
                {!isUser && msg.model && (
                    <span className={styles.modelLabel}>{msg.model}</span>
                )}
            </div>
        </div>
    );
}
