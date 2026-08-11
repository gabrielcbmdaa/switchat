import styles from './DocsView.module.css';

interface DocsViewProps {
    onOpenLegal: () => void;
    onClose?: () => void;
}

export default function DocsView({ onOpenLegal, onClose }: DocsViewProps) {
    return (
        <div className={styles.docsViewContainer}>
            <div className={styles.headerSection}>
                <div className={styles.titleHeader}>
                    <svg width="18" height="18" style={{ color: '#858585' }}>
                        <use xlinkHref="#icon-info" />
                    </svg>
                    <span>Docs</span>
                </div>
                {onClose && (
                    <button className={styles.closeBtn} onClick={onClose} title="Close panel">
                        ✕
                    </button>
                )}
            </div>

            <div className={styles.contentContainer}>
                <button className={styles.legalLink} onClick={onOpenLegal}>
                    Privacy Policy &amp; Terms of Service
                </button>
            </div>
        </div>
    );
}
