import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import styles from './NotesView.module.css';
import toolbarStyles from '../components/SelectionToolbar.module.css';
import { positionOver } from '../utils/floatingPosition';

// Medidas aproximadas de la pildora, que aqui lleva un solo boton.
const PILL_W = 104;
const PILL_H = 36;

interface NotesViewProps {
    notes: string;
    onChange: (notes: string) => void;
    onReply?: (text: string) => void;
    onClose?: () => void;
}

export default function NotesView({ notes, onChange, onReply, onClose }: NotesViewProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [pill, setPill] = useState<{ x: number; y: number; text: string } | null>(null);

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
    };

    // El navegador no expone la seleccion de un textarea a window.getSelection(): lo unico
    // que da son selectionStart y selectionEnd, que son posiciones DENTRO del texto y no
    // coordenadas en pantalla. Por eso la pildora se ancla al puntero, que es lo unico que
    // sabemos de donde acabo la seleccion. pointerup y no mouseup: cubre raton y tactil.
    const handlePointerUp = (e: PointerEvent<HTMLTextAreaElement>) => {
        const textarea = textareaRef.current;
        if (!onReply || !textarea) return;

        const { selectionStart, selectionEnd, value } = textarea;
        const selected = value.slice(selectionStart, selectionEnd).trim();
        if (!selected) {
            setPill(null);
            return;
        }

        // Un punto sin area: positionOver descarta los rects vacios, asi que le damos el
        // pixel que hay bajo el dedo.
        const position = positionOver(
            new DOMRect(e.clientX, e.clientY, 1, 1),
            PILL_W,
            PILL_H
        );
        if (!position) {
            setPill(null);
            return;
        }

        setPill({ ...position, text: selected });
    };

    // El evento que SI disparan los campos de formulario al cambiar su seleccion. Escribir,
    // hacer clic suelto o mover el cursor la vacian, y ahi la pildora ya no apunta a nada.
    const handleSelect = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        if (textarea.selectionStart === textarea.selectionEnd) setPill(null);
    };

    // Anclada al puntero, la pildora no sabe donde se fue el texto al desplazarse: quedarse
    // quieta señalaria a la linea equivocada, que es peor que desaparecer.
    const handleScroll = () => setPill(null);

    const handleReply = () => {
        if (!pill) return;

        onReply?.(pill.text);
        setPill(null);
    };

    // La salida de teclado, igual que en el toolbar de los mensajes. Va en el documento y no
    // en el textarea porque el foco puede haberse ido a otra parte con la pildora abierta.
    useEffect(() => {
        if (!pill) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setPill(null);
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [pill]);

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
                    onPointerUp={handlePointerUp}
                    onSelect={handleSelect}
                    onScroll={handleScroll}
                    placeholder="Write your notes here..."
                    autoFocus
                />
            </div>

            {pill && (
                <div
                    className={toolbarStyles.selectionToolbar}
                    style={{ left: pill.x, top: pill.y }}
                    // Sin esto el navegador colapsa la seleccion al presionar y el onClick
                    // nunca llega a dispararse.
                    onMouseDown={(e) => e.preventDefault()}
                >
                    <button className={toolbarStyles.toolbarButton} onClick={handleReply}>
                        <svg width="14" height="14" style={{ color: 'currentColor' }}>
                            <use xlinkHref="#icon-back" />
                        </svg>
                        Reply
                    </button>
                </div>
            )}
        </div>
    );
}
