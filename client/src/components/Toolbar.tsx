import styles from './Toolbar.module.css';

// Definimos los "poderes" que este componente va a recibir desde App.tsx
interface ToolbarProps {
    onNavConfig: () => void;
    onNavAccount: () => void;
    onNavChats: () => void;
}

export default function Toolbar({ onNavConfig, onNavAccount, onNavChats }: ToolbarProps) {
    return (
        <div className={styles.toolbarContainer}>

            <button className={styles.btnToolbar} onClick={onNavChats}>
                <svg width="24" height="24">
                    <use xlinkHref="#icon-list" /> {/* Asegúrate de tener este id en tu SvgIcons */}
                </svg>
            </button>

            {/* 3. Botón de Cuenta */}
            <button className={styles.btnToolbar} onClick={onNavAccount}>
                <svg width="24" height="24">
                    <use xlinkHref="#icon-account" /> {/* Asegúrate de tener este id en tu SvgIcons */}
                </svg>
            </button>
            {/* 3. Botón de Configuracion */}
            <button className={styles.btnToolbar} onClick={onNavConfig}>
                <svg width="24" height="24">
                    <use xlinkHref="#icon-setting" /> {/* Asegúrate de tener este id en tu SvgIcons */}
                </svg>
            </button>
        </div>
    );
} 