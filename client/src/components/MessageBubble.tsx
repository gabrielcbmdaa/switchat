import { useState } from 'react';
import { Marked } from 'marked';
import styles from './MessageBubble.module.css';
import type { Message } from '../types';

// Al sustituir el renderer de bloques de codigo perdemos el escapado que marked hacia por
// su cuenta, y este HTML termina en un dangerouslySetInnerHTML. Sin esto, un modelo que
// devuelva etiquetas dentro de ``` haria que el navegador las interpretara en vez de
// mostrarlas.
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Instancia propia de marked con un unico cambio: cada bloque ``` sale envuelto en un div
// con el boton de copiar. Es "new Marked" y no "marked.use" para no alterar la
// configuracion global de la libreria.
const markdown = new Marked({
    renderer: {
        code({ text, lang, escaped }) {
            // La marca de un ``` puede traer mas de una palabra ("js showLineNumbers"); solo
            // la primera es el lenguaje.
            const language = (lang ?? '').trim().split(/\s+/)[0];
            const languageClass = language ? ` class="language-${escapeHtml(language)}"` : '';
            // El salto final se recorta antes de decidir si escapar: el <code> siempre acaba
            // en un unico \n, lo escribiera quien lo escribiera. "escaped" viene a true
            // cuando un plugin ya escapo el texto por su cuenta.
            const trimmed = text.replace(/\n$/, '');
            const code = escaped ? trimmed : escapeHtml(trimmed);
            // El boton va fuera del <pre> a proposito: el <pre> hace scroll horizontal, asi
            // que un boton dentro se desplazaria al arrastrar el codigo hacia un lado.
            // Los dos iconos se pintan siempre y el CSS decide cual se ve, porque este HTML
            // no lo controla React y no puede reaccionar a un useState.
            return (
                `<div class="${styles.codeBlock}">` +
                `<button type="button" class="${styles.copyCodeButton}" data-copy-code title="Copy code" aria-label="Copy code">` +
                `<svg class="${styles.copyCodeIcon}" width="14" height="14" aria-hidden="true"><use href="#icon-copy"></use></svg>` +
                `<svg class="${styles.copyCodeIconDone}" width="14" height="14" aria-hidden="true"><use href="#icon-confirm"></use></svg>` +
                `</button>` +
                `<pre><code${languageClass}>${code}\n</code></pre>` +
                `</div>\n`
            );
        },
    },
});

function renderModelHtml(text: string): string {
    const html = markdown.parse(text) as string;
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

    // Un solo listener en la burbuja en vez de uno por bloque: los botones los crea marked
    // como HTML plano, no como elementos de React, asi que no se les puede poner onClick.
    // El click igualmente sube hasta aqui y closest() nos dice si nacio en un boton.
    const handleCodeCopy = async (event: React.MouseEvent<HTMLDivElement>) => {
        // El click nace casi siempre en el <svg> del icono, que es un Element pero no un
        // HTMLElement; closest() esta en Element, asi que ese es el tipo correcto.
        const button = (event.target as Element).closest<HTMLButtonElement>('[data-copy-code]');
        if (!button) return;

        // Leemos el texto del DOM, que es el codigo ya desescapado y tal cual se ve.
        const code = button.parentElement?.querySelector('code')?.textContent ?? '';

        try {
            await navigator.clipboard.writeText(code);
            // El estado "copiado" vive en el propio nodo porque React no repinta este HTML.
            button.classList.add(styles.copied);
            window.setTimeout(() => button.classList.remove(styles.copied), 2000);
        } catch (err) {
            console.error('Failed to copy code to clipboard:', err);
        }
    };

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
                onClick={handleCodeCopy}
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
