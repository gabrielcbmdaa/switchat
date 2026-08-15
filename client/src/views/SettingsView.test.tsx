import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SettingView from './SettingsView';

function renderSettings(overrides: {
    notesEnabled?: boolean;
    onNotesEnabledChange?: (value: boolean) => void;
} = {}) {
    return render(
        <SettingView
            currentModel="gemini-3.5-flash"
            onModelChange={() => { }}
            reasoningLevel="low"
            onReasoningChange={() => { }}
            systemPrompt=""
            onSystemPromptChange={() => { }}
            systemPromptEnabled={true}
            onSystemPromptEnabledChange={() => { }}
            notesEnabled={overrides.notesEnabled ?? false}
            onNotesEnabledChange={overrides.onNotesEnabledChange ?? (() => { })}
        />
    );
}

describe('Notes switch', () => {
    it('sits between System Prompt and Reasoning and starts off', () => {
        renderSettings();

        const notesSwitch = screen.getByRole('switch', { name: 'Notes' });
        expect(notesSwitch).toHaveAttribute('aria-checked', 'false');
        expect(notesSwitch).toHaveAttribute('title', 'This chat cannot read notes');
        expect(screen.queryByPlaceholderText(/write your notes/i)).not.toBeInTheDocument();
    });

    it('tells the parent when the user turns it on', async () => {
        const onNotesEnabledChange = vi.fn();
        renderSettings({ onNotesEnabledChange });

        await userEvent.click(screen.getByRole('switch', { name: 'Notes' }));
        expect(onNotesEnabledChange).toHaveBeenCalledWith(true);
    });
});
