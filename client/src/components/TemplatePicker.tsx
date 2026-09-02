import type { ChatTemplate } from '../config/chatTemplates';
import styles from './TemplatePicker.module.css';

interface TemplatePickerProps {
    templates: ChatTemplate[];
    onSelect: (templateId: string) => void;
}

// The row of starting points that sits under the greeting of an empty chat. It knows
// nothing about where chats come from: it hands back an id and the caller decides what
// that means, which is what keeps it testable without mounting the whole app.
export default function TemplatePicker({ templates, onSelect }: TemplatePickerProps) {
    // Nothing to offer: draw nothing. An empty row would still take its gap under the subtitle.
    if (templates.length === 0) return null;

    return (
        <div className={styles.templatePicker} role="group" aria-label="Start from a template">
            {templates.map((template) => (
                <button
                    key={template.id}
                    type="button"
                    className={styles.templateButton}
                    onClick={() => onSelect(template.id)}
                >
                    {template.label ?? template.title}
                </button>
            ))}
        </div>
    );
}
