import { useState, useEffect, useCallback } from 'react';
import styles from './SelectionToolbar.module.css';
import { appendToNotes } from '../utils/storage';

// Medidas aproximadas del botón, para centrarlo sobre la selección
const TOOLBAR_W = 150;
const TOOLBAR_H = 32;
const GAP = 8;

export default function SelectionToolbar() {
    const [toolbar, setToolbar] = useState<{ x: number; y: number; text: string } | null>(null);

    const evaluateSelection = useCallback(() => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (!selection || !selectedText || selection.isCollapsed) {
            setToolbar(null);
            return;
        }

        // Solo mostramos el botón si la selección nació dentro de una burbuja
        const range = selection.getRangeAt(0);
        const node = range.commonAncestorContainer;
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);

        if (!element?.closest('[data-message-bubble]')) {
            setToolbar(null);
            return;
        }

        const rect = range.getBoundingClientRect();

        setToolbar({
            x: rect.left + rect.width / 2 - TOOLBAR_W / 2, // centrado sobre la selección
            y: rect.top - TOOLBAR_H - GAP,                 // justo encima
            text: selectedText,
        });
    }, []);

    const handleSendToNotes = useCallback(() => {
        if (!toolbar) return;

        // Persistimos directo en localStorage: funciona aunque NotesView
        // no esté montada. El evento solo refresca la vista si ya está abierta.
        appendToNotes(toolbar.text);
        setToolbar(null);

        // Limpiar la selección de texto
        window.getSelection()?.removeAllRanges();
    }, [toolbar]);

    useEffect(() => {
        // pointerup cubre mouse y touch: es cuando la selección queda finalizada
        const handleSelectionChange = () => {
            if (window.getSelection()?.isCollapsed) setToolbar(null);
        };

        document.addEventListener('pointerup', evaluateSelection);
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => {
            document.removeEventListener('pointerup', evaluateSelection);
            document.removeEventListener('selectionchange', handleSelectionChange);
        };
    }, [evaluateSelection]);

    if (!toolbar) return null;

    return (
        <button
            className={styles.selectionButton}
            style={{ left: toolbar.x, top: toolbar.y }}
            // Sin esto el navegador colapsa la selección al presionar,
            // el botón se oculta y el onClick nunca llega a dispararse.
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSendToNotes}
        >
            <svg width="14" height="14" style={{ color: 'currentColor' }}>
                <use xlinkHref="#icon-draft" />
            </svg>
            Send to Notes
        </button>
    );
}
