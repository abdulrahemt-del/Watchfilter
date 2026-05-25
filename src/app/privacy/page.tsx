import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — WatchFilter",
  description: "How WatchFilter collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <Link href="/" className="legal-back">← Back to WatchFilter</Link>

        <header className="legal-header">
          <div className="legal-brand">⚡ WatchFilter</div>
          <h1 className="legal-title">Privacy Policy</h1>
          <p className="legal-date">Effective date: May 20, 2025</p>
        </header>

        <section className="legal-section">
          <p className="legal-lead">
            WatchFilter is a video intelligence tool that analyzes YouTube content on your behalf.
            We are committed to being transparent about what data we handle and how.
          </p>
        </section>

        <section className="legal-section">
          <h2>1. Information We Collect</h2>
          <h3>Data you provide</h3>
          <ul>
            <li><strong>YouTube URLs</strong> — submitted by you for analysis. We process these to fetch transcripts and metadata.</li>
            <li><strong>Email address</strong> — only if you use the "Email Briefing" feature. Stored locally in your browser and used solely to deliver that briefing.</li>
            <li><strong>Voice preference</strong> — your selected TTS voice (Onyx / Nova) stored in local session state only.</li>
          </ul>
          <h3>Data we generate on your behalf</h3>
          <ul>
            <li><strong>Analysis records</strong> — structured intelligence extracted from the video transcript (clickbait score, data points, playbook). Stored in our database tied to the video ID, not to any personal identifier.</li>
            <li><strong>Audio briefings</strong> — MP3 files generated via OpenAI TTS, stored on Vercel Blob Storage with a private URL. No personal data is embedded in these files.</li>
          </ul>
          <h3>Data we do not collect</h3>
          <ul>
            <li>We do not create user accounts or profiles.</li>
            <li>We do not track browsing behavior, set advertising cookies, or fingerprint devices.</li>
            <li>We do not sell, rent, or share any data with third-party advertisers.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>2. Third-Party Services</h2>
          <p>To provide the service, your submitted YouTube URL and the corresponding transcript are sent to the following third parties:</p>
          <ul>
            <li><strong>OpenAI API</strong> — transcript text is sent to OpenAI's GPT-4o-mini model for analysis and to OpenAI TTS for audio generation. OpenAI's <a href="https://openai.com/policies/api-data-usage-policies" target="_blank" rel="noopener noreferrer">API data usage policy</a> applies.</li>
            <li><strong>YouTube / Google</strong> — transcript and metadata are fetched from YouTube's public APIs and caption services. Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> applies to that data.</li>
            <li><strong>Vercel</strong> — our hosting platform and Blob Storage provider. Vercel's <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> applies to infrastructure-level data.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Data Retention</h2>
          <ul>
            <li>Analysis records are stored until you clear your local database or we purge inactive records (no fixed schedule currently).</li>
            <li>Audio files on Vercel Blob are retained indefinitely unless you delete an analysis or we remove inactive blobs.</li>
            <li>We do not retain email addresses beyond the delivery of a single briefing.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Cookies &amp; Local Storage</h2>
          <p>WatchFilter does not use tracking cookies. We use browser <code>localStorage</code> only to remember your email address across sessions for the email briefing feature. No analytics or advertising cookies are set.</p>
        </section>

        <section className="legal-section">
          <h2>5. Security</h2>
          <p>All data is transmitted over HTTPS. Audio files are served from private Vercel Blob URLs. We do not store API keys or credentials in client-side code.</p>
        </section>

        <section className="legal-section">
          <h2>6. Children's Privacy</h2>
          <p>WatchFilter is not directed at children under 13. We do not knowingly collect data from minors.</p>
        </section>

        <section className="legal-section">
          <h2>7. Changes to This Policy</h2>
          <p>We may update this Privacy Policy as the product evolves. Material changes will be reflected in an updated effective date at the top of this page.</p>
        </section>

        <section className="legal-section">
          <h2>8. Contact</h2>
          <p>Questions about this policy? Email us at <a href="mailto:hello@watchfilter.app">hello@watchfilter.app</a>.</p>
        </section>

        <footer className="legal-footer">
          <p>© {new Date().getFullYear()} WatchFilter. All rights reserved.</p>
          <div className="legal-footer-links">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms &amp; Conditions</Link>
            <Link href="/">Back to App</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
