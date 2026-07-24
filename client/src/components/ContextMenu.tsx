import { useState, useEffect, useCallback } from 'react';
import styles from './ContextMenu.module.css';
import { appendToNotes } from '../utils/storage';

export default function ContextMenu() {
    const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

    const handleContextMenu = useCallback((e: MouseEvent) => {
        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        if (!selectedText) return; // No hay texto seleccionado → menú nativo del navegador

        e.preventDefault();

        // Ajustar posición para que no se salga de la pantalla
        const menuWidth = 200;
        const menuHeight = 44;
        const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
        const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);

        setMenu({ x, y, text: selectedText });
    }, []);

    const handleClose = useCallback(() => {
        setMenu(null);
    }, []);

    const handleSendToNotes = useCallback(() => {
        if (!menu) return;

        // Persistimos directo en localStorage: funciona aunque NotesView
        // no esté montada. El evento solo refresca la vista si ya está abierta.
        appendToNotes(menu.text);
        setMenu(null);

        // Limpiar la selección de texto
        window.getSelection()?.removeAllRanges();
    }, [menu]);

    useEffect(() => {
        document.addEventListener('contextmenu', handleContextMenu);
        return () => document.removeEventListener('contextmenu', handleContextMenu);
    }, [handleContextMenu]);

    if (!menu) return null;

    return (
        <>
            {/* Overlay invisible para cerrar el menú al hacer click fuera */}
            <div className={styles.contextMenuOverlay} onClick={handleClose} onContextMenu={(e) => { e.preventDefault(); handleClose(); }} />

            <div
                className={styles.contextMenu}
                style={{ left: menu.x, top: menu.y }}
            >
                <button className={styles.menuItem} onClick={handleSendToNotes}>
                    <svg width="16" height="16" style={{ color: 'currentColor' }}>
                        <use xlinkHref="#icon-draft" />
                    </svg>
                    Send to Notes
                </button>
            </div>
        </>
    );
}
