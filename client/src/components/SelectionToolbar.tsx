import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './SelectionToolbar.module.css';
import { appendToNotes } from '../utils/storage';

// Medidas aproximadas del botón, para centrarlo sobre la selección
const TOOLBAR_W = 150;
const TOOLBAR_H = 32;
const GAP = 8;

// Coloca el botón centrado sobre la selección, sin salirse del viewport.
// Devuelve null si el rect ya no es válido o quedó fuera de pantalla.
function positionFor(rect: DOMRect): { x: number; y: number } | null {
    // Rect vacío: el rango se invalidó (ej. re-render durante el streaming)
    if (!rect.width && !rect.height) return null;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;

    let y = rect.top - TOOLBAR_H - GAP;
    if (y < GAP) y = rect.bottom + GAP; // sin sitio arriba → debajo

    const rawX = rect.left + rect.width / 2 - TOOLBAR_W / 2;
    const x = Math.max(GAP, Math.min(rawX, window.innerWidth - TOOLBAR_W - GAP));

    return { x, y };
}

export default function SelectionToolbar() {
    const [toolbar, setToolbar] = useState<{ x: number; y: number; text: string } | null>(null);
    // Guardamos el rango para poder recalcular la posición al hacer scroll
    const rangeRef = useRef<Range | null>(null);

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

        const position = positionFor(range.getBoundingClientRect());
        if (!position) {
            setToolbar(null);
            return;
        }

        rangeRef.current = range.cloneRange();
        setToolbar({ ...position, text: selectedText });
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

    const isOpen = toolbar !== null;

    // Mientras el botón está visible, lo mantenemos pegado a la selección
    useEffect(() => {
        if (!isOpen) return;

        let frame = 0;
        const reposition = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const range = rangeRef.current;
                if (!range) return;

                const position = positionFor(range.getBoundingClientRect());
                if (!position) {
                    setToolbar(null); // la selección salió de pantalla
                    return;
                }
                setToolbar((prev) => (prev ? { ...prev, ...position } : prev));
            });
        };

        // capture: true porque el scroll del contenedor de mensajes no burbujea hasta document
        document.addEventListener('scroll', reposition, { capture: true, passive: true });
        window.addEventListener('resize', reposition);
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('scroll', reposition, { capture: true });
            window.removeEventListener('resize', reposition);
        };
    }, [isOpen]);

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
