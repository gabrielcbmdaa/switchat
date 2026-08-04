import styles from './DocsView.module.css';

interface DocsViewProps {
    onClose?: () => void;
}

interface DocsSection {
    title: string;
    body: string[];
}

// DRAFT: written to reflect what the app actually does today. Not legal advice —
// review with counsel before treating this as final.
const SECTIONS: DocsSection[] = [
    {
        title: 'Privacy Policy',
        body: [
            'Switchat can run in two modes. Signed in ("online mode"), your account email, a bcrypt hash of your password, and your chats, messages and drafts are stored in a MongoDB Atlas database. Signed out ("offline mode"), everything stays in your browser\'s localStorage and nothing is sent to our database.',
            'Your session is kept in an httpOnly, strict-same-site cookie signed with JWT that expires after 7 days. It cannot be read by page scripts.',
            'API keys you add in Account are saved only in your browser\'s localStorage. In online mode, when you send a message, your key for the selected provider is sent to our server with that single request (as a header) so the server can call the provider on your behalf — it is used for that request and is not stored in the database.',
            'Message content is sent to the AI provider you selected for that chat (Google, Anthropic, or OpenAI) so it can generate a reply. Each provider processes that content under its own privacy policy.',
            'You can permanently delete your account and all associated chats, messages and settings at any time from Account → Delete account.',
        ],
    },
    {
        title: 'Terms of Service',
        body: [
            'Switchat is provided as-is, without warranties of any kind. We do not guarantee uninterrupted availability or that responses from connected AI providers will be accurate, complete, or suitable for any purpose.',
            'You are responsible for the content of the messages you send and for keeping your account password and any API keys you add confidential.',
            'You must be legally able to enter into this agreement to create an account. New account registration can be closed by the administrator at any time without notice.',
            'Do not use Switchat to generate or distribute unlawful content, or to attempt to disrupt or gain unauthorized access to the service or connected provider APIs.',
            'These terms may change as the app evolves. Continuing to use Switchat after a change means you accept the updated terms.',
        ],
    },
];

export default function DocsView({ onClose }: DocsViewProps) {
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
                {SECTIONS.map((section) => (
                    <section key={section.title} className={styles.docSection}>
                        <h3 className={styles.docSectionTitle}>{section.title}</h3>
                        {section.body.map((paragraph, i) => (
                            <p key={i} className={styles.docParagraph}>{paragraph}</p>
                        ))}
                    </section>
                ))}
            </div>
        </div>
    );
}
