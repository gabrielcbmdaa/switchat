import styles from './LegalView.module.css';

interface LegalViewProps {
    onClose: () => void;
}

interface LegalSection {
    title: string;
    body: string[];
}

// DRAFT: written to reflect what the app actually does today. Not legal advice —
// review with counsel before treating this as final.
const SECTIONS: LegalSection[] = [
    {
        title: 'Privacy Policy',
        body: [
            'Switchat can run in two modes. Signed in ("online mode"), your account email, a bcrypt hash of your password, and your chats, messages and drafts are stored in a MongoDB database on our own server. Signed out ("offline mode"), everything stays in your browser\'s localStorage and nothing is sent to our database.',
            'Your session is kept in an httpOnly, strict-same-site cookie signed with JWT that expires after 7 days. It cannot be read by page scripts.',
            'API keys you add in Account are always saved in your browser\'s localStorage, and your browser is what calls the AI provider with them — our server never uses your keys to contact a provider, in either mode.',
            'Signing in does not upload your API keys. Each key in Account has its own button that stores that single key in our database so it follows you between devices, and a second button that takes it back out while leaving it in this browser. Nothing is stored in the database until you press it.',
            'A key you choose to store is encrypted with AES-256-GCM using a key held only by the server, and is sent back to your browser when you sign in so it can call the provider. Deleting a key in Account also deletes it from the database, and taking a key out of the database removes it from your other devices.',
            'Message content is sent by your browser to the AI provider you selected for that chat (Google, Anthropic, or OpenAI) so it can generate a reply. Each provider processes that content under its own privacy policy. If you select a local model instead (LM Studio or Ollama), the request goes to the server running on your own machine and the content never leaves it.',
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

// This lives in the center column, not in the right panel: legal prose is unreadable in
// 300px. It is a view and not a chat on purpose — a chat belongs to the user, who can
// delete or rename it, and online it would be stored per account in the database.
export default function LegalView({ onClose }: LegalViewProps) {
    return (
        <div className={styles.legalViewContainer}>
            <div className={styles.headerSection}>
                <div className={styles.titleHeader}>
                    <svg width="18" height="18" style={{ color: '#858585' }}>
                        <use xlinkHref="#icon-info" />
                    </svg>
                    <span>Privacy &amp; Terms</span>
                </div>
                <button className={styles.backButton} onClick={onClose}>
                    Back to chat
                </button>
            </div>

            <div className={styles.contentContainer}>
                <article className={styles.document}>
                    {SECTIONS.map((section) => (
                        <section key={section.title} className={styles.legalSection}>
                            <h2 className={styles.legalSectionTitle}>{section.title}</h2>
                            {section.body.map((paragraph, i) => (
                                <p key={i} className={styles.legalParagraph}>{paragraph}</p>
                            ))}
                        </section>
                    ))}
                </article>
            </div>
        </div>
    );
}
