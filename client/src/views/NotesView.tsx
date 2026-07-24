import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import styles from './NotesView.module.css';

interface NotesViewProps {
    onClose?: () => void;
}

export default function NotesView({ onClose }: NotesViewProps) {
    const [notes, setNotes] = useState<string>(() => {
        return localStorage.getItem('switchat_notes') || '';
    });
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value;
        setNotes(value);
        localStorage.setItem('switchat_notes', value);
    };

    // Escuchar el evento global "sendToNotes" disparado desde el ContextMenu
    useEffect(() => {
        const handleSendToNotes = (e: Event) => {
            // El detail ya trae el texto completo actualizado (persistido por appendToNotes).
            const updated = (e as CustomEvent<string>).detail;
            if (!updated) return;

            setNotes(updated);

            // Auto-scroll al final del textarea para que el usuario vea el texto añadido
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
                }
            }, 0);
        };

        window.addEventListener('sendToNotes', handleSendToNotes);
        return () => window.removeEventListener('sendToNotes', handleSendToNotes);
    }, []);

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
                    ref={textareaRef}
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
