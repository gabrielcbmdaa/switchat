import { useRef, useEffect, useCallback } from 'react';
import styles from './PromptInput.module.css';

interface PromptInputProps {
    draft: string;
    onDraftChange: (draft: string) => void;
    onSendMessage: () => void;
    isGenerating?: boolean;
    onStopGeneration?: () => void;
    onHeightChange?: (height: number) => void; // Callback para reportar la altura
    // 'docked' va anclado al fondo del chat; 'centered' fluye dentro de la vista vacía
    variant?: 'docked' | 'centered';
}

export default function PromptInput({
    draft,
    onDraftChange,
    onSendMessage,
    isGenerating = false,
    onStopGeneration,
    onHeightChange,
    variant = 'docked',
}: PromptInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-resize: ajusta la altura del textarea según el contenido
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; // Reseteamos para recalcular
            textarea.style.height = textarea.scrollHeight + 'px'; // Ajustamos al contenido
        }
    }, [draft]);

    // ResizeObserver: cada vez que el contenedor cambia de tamaño, reportamos la altura
    const reportHeight = useCallback(() => {
        if (containerRef.current && onHeightChange) {
            onHeightChange(containerRef.current.offsetHeight);
        }
    }, [onHeightChange]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !onHeightChange) return;

        // Reportamos la altura inicial
        reportHeight();

        // Observamos cambios de tamaño del contenedor
        const observer = new ResizeObserver(() => {
            reportHeight();
        });
        observer.observe(container);

        // Limpieza: dejamos de observar cuando el componente se desmonte
        return () => observer.disconnect();
    }, [reportHeight, onHeightChange]);

    // Escuchar el evento global "focusPrompt" disparado al responder a una selección
    useEffect(() => {
        const handleFocusPrompt = () => {
            // setTimeout 0: esperamos al re-render con el draft nuevo, si no
            // el cursor caería al final del texto viejo
            setTimeout(() => {
                const textarea = textareaRef.current;
                if (!textarea) return;

                textarea.focus();
                const end = textarea.value.length;
                textarea.setSelectionRange(end, end);
            }, 0);
        };

        window.addEventListener('focusPrompt', handleFocusPrompt);
        return () => window.removeEventListener('focusPrompt', handleFocusPrompt);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Evita el salto de línea
            if (isGenerating) return;
            onSendMessage();    // Dispara el envío del mensaje
        }
    };

    return (
        <div
            ref={containerRef}
            className={`${styles.promptInputContainer} ${variant === 'centered' ? styles.promptInputCentered : ''}`}
        >
            <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                placeholder="Escribe un mensaje..."
                className={styles.promptTextarea}
                onKeyDown={handleKeyDown}
                rows={1}
            />
            <button
                className={styles.sendButton}
                onClick={isGenerating ? onStopGeneration : onSendMessage}
                title={isGenerating ? 'Detener generación' : 'Enviar mensaje'}
                type="button"
            >
                <svg width="20" height="20">
                    <use xlinkHref={isGenerating ? '#icon-stop' : '#icon-send'} />
                </svg>
            </button>
        </div>
    );
}
