import styles from './Toolbar.module.css';

// Definimos los "poderes" que este componente va a recibir desde App.tsx
interface ToolbarProps {
    onNavConfig: () => void;
    onNavAccount: () => void;
    onNavChats: () => void;
    onNavNotes: () => void;
}

export default function Toolbar({ onNavConfig, onNavAccount, onNavChats, onNavNotes }: ToolbarProps) {
    return (
        <div className={styles.toolbarContainer}>

            {/* 3. Botón de Cuenta */}
            <button className={styles.btnToolbar} onClick={onNavAccount} title="Account">
                <svg width="24" height="24">
                    <use xlinkHref="#icon-account" /> {/* Asegúrate de tener este id en tu SvgIcons */}
                </svg>
            </button>
            <button className={styles.btnToolbar} onClick={onNavChats} title="Chats">
                <svg width="24" height="24">
                    <use xlinkHref="#icon-list" /> {/* Asegúrate de tener este id en tu SvgIcons */}
                </svg>
            </button>

            {/* 2. Botón de Borrador / Notas */}
            <button className={styles.btnToolbar} onClick={onNavNotes} title="Notes">
                <svg width="24" height="24">
                    <use xlinkHref="#icon-draft" />
                </svg>
            </button>

            {/* 4. Botón de Configuracion */}
            <button className={styles.btnToolbar} onClick={onNavConfig} title="Settings">
                <svg width="24" height="24">
                    <use xlinkHref="#icon-setting" /> {/* Asegúrate de tener este id en tu SvgIcons */}
                </svg>
            </button>
        </div>
    );
} 