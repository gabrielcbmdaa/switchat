import { type ChangeEvent } from 'react';
import styles from './NotesView.module.css';

interface NotesViewProps {
    notes: string;
    onChange: (notes: string) => void;
    onClose?: () => void;
}

export default function NotesView({ notes, onChange, onClose }: NotesViewProps) {

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
    };

    return (
        <div className={styles.notesViewContainer}>
            <div className={styles.headerSection}>
                <div className={styles.titleHeader}>
                    <svg width="18" height="18" style={{ color: '#858585' }}>
                        <use xlinkHref="#icon-draft" />
                    </svg>
                    <span>Notes</span>
                </div>
                {onClose && (
                    <button className={styles.closeBtn} onClick={onClose} title="Close panel">
                        ✕
                    </button>
                )}
            </div>

            <div className={styles.textareaContainer}>
                <textarea
                    className={styles.notesTextarea}
                    value={notes}
                    onChange={handleChange}
                    placeholder="Write your notes here..."
                    autoFocus
                />
            </div>
        </div>
    );
}
