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
          <p className="legal-date">Effective date: July 30, 2026</p>
        </header>

        <section className="legal-section">
          <p className="legal-lead">
            WatchFilter is a video intelligence tool that analyzes YouTube content on your behalf.
            WatchFilter uses YouTube API Services. By using WatchFilter, you agree to be bound by
            the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>{" "}
            and Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
            We are committed to being transparent about what data we handle and how.
          </p>
        </section>

        <section className="legal-section">
          <h2>1. Information We Collect</h2>
          <h3>Data you provide</h3>
          <ul>
            <li><strong>YouTube URLs</strong> — submitted by you for analysis. We process these to fetch transcripts and metadata.</li>
            <li><strong>Google account access</strong> — if you connect your Google account, we request read-only access to your YouTube subscriptions and account identifiers (email, name) via Google Sign-In, using YouTube API Services. This is used solely to display and analyze your subscription feed inside WatchFilter.</li>
            <li><strong>Email address</strong> — collected when you sign in with Google, or if you use the "Email Briefing" feature. Sign-in email is stored server-side to associate your OAuth tokens with your account; briefing email is stored locally in your browser and used solely to deliver that briefing.</li>
            <li><strong>Voice preference</strong> — your selected TTS voice (Onyx / Nova) stored in local session state only.</li>
          </ul>
          <h3>Data we generate on your behalf</h3>
          <ul>
            <li><strong>Analysis records</strong> — structured intelligence extracted from the video transcript (clickbait score, data points, playbook). Stored in our database tied to the video ID, not to any personal identifier.</li>
            <li><strong>Audio briefings</strong> — MP3 files generated via OpenAI TTS, stored on Vercel Blob Storage with a private URL. No personal data is embedded in these files.</li>
          </ul>
          <h3>Data we do not collect</h3>
          <ul>
            <li>We do not track browsing behavior, set advertising cookies, or fingerprint devices.</li>
            <li>We do not sell, rent, or share any data with third-party advertisers.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>2. How We Use, Process &amp; Share Your Information</h2>
          <p>We use the data described above only to operate and improve WatchFilter. Specifically:</p>
          <ul>
            <li><strong>Your YouTube subscription data</strong> (obtained via YouTube API Services after you sign in with Google) is used only to build your in-app subscription feed and to generate the AI analysis you see. It is cached server-side to avoid re-fetching on every visit, and is never sold, rented, shared with advertisers, or used for any purpose beyond powering your WatchFilter feed.</li>
            <li><strong>Your Google OAuth refresh token</strong> is stored server-side (encrypted at rest by our database provider) so we can refresh your access without asking you to sign in repeatedly. It is used only to call YouTube API Services on your behalf and is never shared with any third party.</li>
            <li><strong>Video transcripts and titles</strong> you submit (or that are pulled from your subscription feed) are sent to OpenAI for AI analysis — see Section 3 below.</li>
            <li><strong>We do not share your personal information</strong> (email, Google account identifiers, subscription data) with any internal team, affiliate, or external party other than the service providers listed in Section 3, who process it solely to provide the Service to you and are contractually/by-policy bound not to use it for their own purposes.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Third-Party Services</h2>
          <p>To provide the service, data described above is sent to the following third parties:</p>
          <ul>
            <li><strong>OpenAI API</strong> — transcript text is sent to OpenAI's GPT-4o-mini model for analysis and to OpenAI TTS for audio generation. OpenAI's <a href="https://openai.com/policies/api-data-usage-policies" target="_blank" rel="noopener noreferrer">API data usage policy</a> applies.</li>
            <li><strong>YouTube API Services / Google</strong> — video transcripts, metadata, and (if you sign in) your subscription feed are fetched using YouTube API Services and Google Sign-In. Google's <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> applies to that data.</li>
            <li><strong>Vercel</strong> — our hosting platform and Blob Storage provider. Vercel's <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> applies to infrastructure-level data.</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Data Retention, Deletion &amp; Revoking Access</h2>
          <ul>
            <li>Analysis records are stored until you clear your local database or we purge inactive records (no fixed schedule currently).</li>
            <li>Audio files on Vercel Blob are retained indefinitely unless you delete an analysis or we remove inactive blobs.</li>
            <li>We do not retain briefing email addresses beyond the delivery of a single briefing.</li>
            <li>
              <strong>Deleting your account data:</strong> to request deletion of your stored Google
              account data (OAuth tokens, cached subscription data, sign-in email), use the
              "Disconnect Google Account" option in WatchFilter's Settings, or email{" "}
              <a href="mailto:hello@watchfilter.app">hello@watchfilter.app</a> and we will delete it
              within 30 days.
            </li>
            <li>
              <strong>Revoking WatchFilter's access to your Google account:</strong> disconnecting
              in-app immediately deletes our stored refresh token and revokes it with Google. You can
              also revoke WatchFilter's access at any time directly from Google, independent of
              WatchFilter, at{" "}
              <a href="https://myaccount.google.com/connections?filters=3,4&hl=en" target="_blank" rel="noopener noreferrer">
                myaccount.google.com/connections
              </a>.
            </li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Cookies &amp; Local Storage</h2>
          <p>WatchFilter does not use tracking cookies. We use browser <code>localStorage</code> only to remember your email address across sessions for the email briefing feature, and a session cookie to keep you signed in with Google. No analytics or advertising cookies are set.</p>
        </section>

        <section className="legal-section">
          <h2>6. Security</h2>
          <p>All data is transmitted over HTTPS. Audio files are served from private Vercel Blob URLs. OAuth tokens are stored server-side only and are never exposed to client-side code.</p>
        </section>

        <section className="legal-section">
          <h2>7. Children's Privacy</h2>
          <p>WatchFilter is not directed at children under 13. We do not knowingly collect data from minors.</p>
        </section>

        <section className="legal-section">
          <h2>8. Changes to This Policy</h2>
          <p>We may update this Privacy Policy as the product evolves. Material changes will be reflected in an updated effective date at the top of this page.</p>
        </section>

        <section className="legal-section">
          <h2>9. Contact</h2>
          <p>Questions about this policy, or a request to delete your data? Email us at <a href="mailto:hello@watchfilter.app">hello@watchfilter.app</a>.</p>
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
