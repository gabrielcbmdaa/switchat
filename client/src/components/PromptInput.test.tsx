import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import PromptInput from './PromptInput';

describe('PromptInput', () => {
    it('sends the message when Enter is pressed without shift', async () => {
        const onSendMessage = vi.fn();
        render(
            <PromptInput draft="hello" onDraftChange={() => { }} onSendMessage={onSendMessage} />
        );

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), '{Enter}');

        expect(onSendMessage).toHaveBeenCalledOnce();
    });

    it('keeps the newline and does not send when Enter is pressed with shift', async () => {
        const onSendMessage = vi.fn();
        render(
            <PromptInput draft="hello" onDraftChange={() => { }} onSendMessage={onSendMessage} />
        );

        await userEvent.type(screen.getByPlaceholderText('Write a message...'), '{Shift>}{Enter}{/Shift}');

        expect(onSendMessage).not.toHaveBeenCalled();
    });

    it('stops the generation instead of sending while the model is answering', async () => {
        const onSendMessage = vi.fn();
        const onStopGeneration = vi.fn();
        render(
            <PromptInput
                draft="hello"
                onDraftChange={() => { }}
                onSendMessage={onSendMessage}
                isGenerating
                onStopGeneration={onStopGeneration}
            />
        );

        await userEvent.click(screen.getByTitle('Stop generating'));

        expect(onStopGeneration).toHaveBeenCalledOnce();
        expect(onSendMessage).not.toHaveBeenCalled();
    });
});
