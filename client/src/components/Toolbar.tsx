import styles from './Toolbar.module.css';

// Definimos los "poderes" que este componente va a recibir desde App.tsx
interface ToolbarProps {
    onNavConfig?: () => void;
    onNavAccount?: () => void;
    onNavChats?: () => void;
    onNavNotes?: () => void;
}

export default function Toolbar({ onNavConfig, onNavAccount, onNavChats, onNavNotes }: ToolbarProps) {
    return (
        <div className={styles.toolbarContainer}>
            {onNavAccount && (
                <button className={styles.btnToolbar} onClick={onNavAccount} title="Account">
                    <svg width="24" height="24">
                        <use xlinkHref="#icon-account" />
                    </svg>
                </button>
            )}
            {onNavChats && (
                <button className={styles.btnToolbar} onClick={onNavChats} title="Chats">
                    <svg width="24" height="24">
                        <use xlinkHref="#icon-list" />
                    </svg>
                </button>
            )}
            {onNavNotes && (
                <button className={styles.btnToolbar} onClick={onNavNotes} title="Notes">
                    <svg width="24" height="24">
                        <use xlinkHref="#icon-draft" />
                    </svg>
                </button>
            )}
            {onNavConfig && (
                <button className={styles.btnToolbar} onClick={onNavConfig} title="Settings">
                    <svg width="24" height="24">
                        <use xlinkHref="#icon-setting" />
                    </svg>
                </button>
            )}
        </div>
    );
} 