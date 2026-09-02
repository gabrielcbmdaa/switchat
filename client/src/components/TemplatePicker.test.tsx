import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import TemplatePicker from './TemplatePicker';
import type { ChatTemplate } from '../config/chatTemplates';

const templates: ChatTemplate[] = [
    { id: 'welcome', label: '🚀 Welcome & Tutorial', title: 'Welcome chat', messages: [] },
    { id: 'english-tutor', label: 'English Tutor', title: 'English Tutor', messages: [] },
];

describe('TemplatePicker', () => {
    it('offers one button per template', () => {
        render(<TemplatePicker templates={templates} onSelect={vi.fn()} />);

        expect(screen.getByRole('button', { name: '🚀 Welcome & Tutorial' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'English Tutor' })).toBeInTheDocument();
    });

    it('reports which template was picked', async () => {
        const onSelect = vi.fn();
        render(<TemplatePicker templates={templates} onSelect={onSelect} />);

        await userEvent.click(screen.getByRole('button', { name: 'English Tutor' }));

        // The id, not the label: the label is copy and changes without the chat changing.
        expect(onSelect).toHaveBeenCalledWith('english-tutor');
        expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('falls back to the title when a template carries no label of its own', () => {
        // Two ways of naming the same thing drift apart: change one and the pill ends up
        // calling the chat something the chat does not call itself. The label is for the
        // template that genuinely needs a shorter pill, and nothing else has to repeat it.
        render(<TemplatePicker templates={[{ id: 'plain', title: 'A plain template', messages: [] }]} onSelect={vi.fn()} />);

        expect(screen.getByRole('button', { name: 'A plain template' })).toBeInTheDocument();
    });

    it('draws nothing at all when there are no templates', () => {
        // An empty row would still eat its gap under the subtitle.
        const { container } = render(<TemplatePicker templates={[]} onSelect={vi.fn()} />);

        expect(container).toBeEmptyDOMElement();
    });
});
