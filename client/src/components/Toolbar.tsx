import { useState, useEffect } from 'react';
import styles from './Toolbar.module.css';

// Definimos los "poderes" que este componente va a recibir desde App.tsx
interface ToolbarProps {
    onDeleteChat: () => void;
    onNavConfig: () => void;
    onNavAccount: () => void;
    onNavChats: () => void;
}

export default function Toolbar({ onDeleteChat, onNavConfig, onNavAccount, onNavChats }: ToolbarProps) {
    // Estado local exclusivo para el botón de borrar
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    // Este useEffect reemplaza tu setTimeout manual
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;

        // Si estamos en modo "confirmación", arrancamos el cronómetro de 5 segundos
        if (isConfirmingDelete) {
            timer = setTimeout(() => {
                setIsConfirmingDelete(false); // Volvemos a la normalidad
            }, 5000);
        }

        // Limpiamos el cronómetro si el componente desaparece para evitar errores de memoria
        return () => clearTimeout(timer);
    }, [isConfirmingDelete]);

    // La función que decide qué hace el botón de basura
    const handleDeleteClick = () => {
        if (!isConfirmingDelete) {
            setIsConfirmingDelete(true); // Primer clic: pedimos confirmación
        } else {
            onDeleteChat(); // Segundo clic: avisamos a App.tsx que borre de verdad
            setIsConfirmingDelete(false); // Reiniciamos el botón
        }
    };

    return (
        <div className={styles.toolbarContainer}>

            {/* 2. Botón de Borrar (con estado interactivo) */}
            <button className={styles.btnToolbar} onClick={handleDeleteClick}>
                <svg width="24" height="24">
                    <use xlinkHref={isConfirmingDelete ? "#icon-confirm" : "#icon-trash"} />
                </svg>
            </button>
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