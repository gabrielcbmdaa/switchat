import { useState } from "react";
import styles from './SettingsView.module.css'
import { getProviderIconId, MODEL_REGISTRY } from "../config/models.config";
import { getThinkingLevels } from "../utils/modelPreferences";

interface SettingViewProps {
    currentModel: string;
    onModelChange: (model: string) => void;
    reasoningLevel: string;
    onReasoningChange: (level: string) => void;
    systemPrompt: string;
    onSystemPromptChange: (value: string) => void;
    systemPromptEnabled: boolean;
    onSystemPromptEnabledChange: (value: boolean) => void;
    notesEnabled: boolean;
    onNotesEnabledChange: (value: boolean) => void;
    onClose?: () => void;
}

export default function SettingView({ currentModel, onModelChange, reasoningLevel, onReasoningChange, systemPrompt, onSystemPromptChange, systemPromptEnabled, onSystemPromptEnabledChange, notesEnabled, onNotesEnabledChange, onClose }: SettingViewProps) {
    // El panel no guarda nada: los niveles salen del modelo y el valor llega ya
    // resuelto desde arriba, que es quien decide a quién pertenece.
    const thinkingLevels = getThinkingLevels(currentModel);
    // El slider trabaja con índices, pero fuera de aquí solo viaja la etiqueta:
    // el índice significa cosas distintas según el modelo.
    const sliderValue = Math.max(0, thinkingLevels.indexOf(reasoningLevel));

    const [searchQuery, setSearchQuery] = useState('');

    const availableModels = Object.keys(MODEL_REGISTRY);
    const filteredModels = availableModels.filter(model =>
        model.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectModel = (modelName: string) => {
        onModelChange(modelName);
        setSearchQuery('');
    };

    return (
        <div className={styles.settingsViewContainer}>
            {onClose && (
                <div className={styles.headerSection}>
                    <span className={styles.configLabel}>Settings</span>
                    <button type="button" className={styles.closeBtn} onClick={onClose} title="Close">
                        ✕
                    </button>
                </div>
            )}
            <div className={styles.modelSection}>
                {/* MODELS */}
                <div className={styles.modelContainer}>
                    <label className={styles.configLabel}>Model</label>
                    <div className={styles.modelSelected}>
                        {(() => {
                            const iconId = getProviderIconId(currentModel);
                            return iconId ? (
                                <svg className={styles.providerIcon} width="16" height="16">
                                    <use xlinkHref={`#${iconId}`} />
                                </svg>
                            ) : null;
                        })()}
                        {currentModel}
                    </div>
                    <div className={styles.dropdownList}>
                        <input
                            type="text"
                            value={searchQuery}
                            className={styles.searchBox}
                            placeholder="Search model ID..."
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && searchQuery.trim()) {
                                    handleSelectModel(searchQuery.trim());
                                }
                            }}
                        />
                        {filteredModels.length > 0 ? (
                            filteredModels.map(model => {
                                const iconId = getProviderIconId(model);
                                return (
                                    <div
                                        key={model}
                                        className={styles.dropdownItem}
                                        onClick={() => handleSelectModel(model)}
                                    >
                                        <span className={styles.modelName}>
                                            {iconId && (
                                                <svg className={styles.providerIcon} width="16" height="16">
                                                    <use xlinkHref={`#${iconId}`} />
                                                </svg>
                                            )}
                                            {model}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className={styles.noMatches}>
                                There are no coincidences
                            </div>
                        )}
                    </div>
                </div>
                {/* SYSTEM PROMPT */}
                <div className={styles.systemPromptContainer}>
                    <div className={styles.systemPromptHeader}>
                        <label className={styles.configLabel} htmlFor="systemPromptInput">System Prompt</label>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={systemPromptEnabled}
                            aria-label="System Prompt"
                            title={systemPromptEnabled ? 'Turn off system prompt' : 'Turn on system prompt'}
                            className={`${styles.toggleSwitch} ${systemPromptEnabled ? styles.toggleSwitchOn : ''}`}
                            onClick={() => onSystemPromptEnabledChange(!systemPromptEnabled)}
                        >
                            <span className={styles.toggleKnob} />
                        </button>
                    </div>
                    <textarea
                        id="systemPromptInput"
                        className={styles.systemPromptTextarea}
                        placeholder="Optional instructions the AI should always follow (tone, role, constraints)..."
                        value={systemPrompt}
                        onChange={(e) => onSystemPromptChange(e.target.value)}
                    />
                </div>
                <div className={styles.notesContainer}>
                    <div className={styles.notesHeader}>
                        <label className={styles.configLabel} id="notesEnabledLabel">Notes</label>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={notesEnabled}
                            aria-labelledby="notesEnabledLabel"
                            aria-label="Notes"
                            title={notesEnabled ? 'This chat can read notes' : 'This chat cannot read notes'}
                            className={`${styles.toggleSwitch} ${notesEnabled ? styles.toggleSwitchOn : ''}`}
                            onClick={() => onNotesEnabledChange(!notesEnabled)}
                        >
                            <span className={styles.toggleKnob} />
                        </button>
                    </div>
                </div>
                {/* REASONING — Solo se muestra si el modelo soporta thinking */}
                {thinkingLevels.length > 0 && (
                    <div className={styles.reasoningContainer}>
                        <div className={styles.reasoningHeader}>
                            <label className={styles.configLabel} htmlFor="reasoningInput">Reasoning</label>
                            <span className={styles.reasoningValueLabel}>
                                {thinkingLevels[sliderValue]}
                            </span>
                        </div>
                        <input
                            id="reasoningInput"
                            type="range"
                            min="0"
                            max={thinkingLevels.length - 1}
                            step="1"
                            value={sliderValue}
                            onChange={(e) => onReasoningChange(thinkingLevels[Number(e.target.value)])}
                            className={styles.reasoningSlider}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
