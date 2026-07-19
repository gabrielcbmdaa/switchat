import { useState, type ChangeEvent } from 'react';
import styles from './NotesView.module.css';

interface NotesViewProps {
    onClose?: () => void;
}

export default function NotesView({ onClose }: NotesViewProps) {
    const [notes, setNotes] = useState<string>(() => {
        return localStorage.getItem('switchat_notes') || '';
    });

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setNotes(value);
        localStorage.setItem('switchat_notes', value);
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
