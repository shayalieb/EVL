import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import { getLandingConfig } from '../lib/landing';

export default function PrivacyPolicyPage() {
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { getLandingConfig().then((data) => setConfig(data.config)).catch(() => setFailed(true)); }, []);

  if (failed) return <Navigate to="/" replace />;
  if (!config) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  const { entityName, contactEmail } = config.legal;

  return (
    <LegalPageLayout config={config} title="Privacy Policy">
      <p>This Privacy Policy explains how {entityName} ("we," "us," or "our") collects, uses, and shares information when you use GigWorks (the "Service"). It covers both your own account information and the business data you enter into the Service.</p>

      <h2>1. Information We Collect</h2>
      <p>We collect a few different kinds of information:</p>
      <ul>
        <li><strong>Account information</strong> you give us directly: your name, email, phone number, business name, and a securely hashed password. We never store your password in readable form.</li>
        <li><strong>Business data you enter</strong> to use the Service: your clients' and contractors' contact details, bookings, events, proposals, contracts, invoices, and financial records. This data belongs to you — see our <a href="/terms">Terms of Service</a> for more on that.</li>
        <li><strong>Payment information</strong>: when you or your clients pay through the Service, card details are entered directly into Stripe's own secure checkout — we never see or store full card numbers.</li>
        <li><strong>Usage information</strong>: basic technical information like IP address and browser type, collected automatically for security and to keep the Service running reliably.</li>
      </ul>

      <h2>2. How We Use Information</h2>
      <p>We use this information to operate and provide the Service: to run your account, process payments, send transactional emails (like invoice notifications or password resets), respond to support requests, and keep the Service secure and reliable. We don't sell your information, and we don't use your business data to advertise to your clients or contractors.</p>

      <h2>3. Third-Party Service Providers</h2>
      <p>We rely on a small number of trusted service providers to run GigWorks, each of whom processes information only as needed to provide their service to us:</p>
      <ul>
        <li><strong>Stripe</strong> — payment processing, for both your subscription billing and your own clients' invoice payments.</li>
        <li><strong>Resend</strong> — delivering transactional emails sent from the Service (invoices, contract links, notifications).</li>
        <li><strong>Supabase</strong> — hosting our database, where account and business data is stored.</li>
        <li><strong>Vercel</strong> — hosting the application you interact with in your browser.</li>
        <li><strong>Sentry</strong> — error monitoring, so we can find and fix problems in the Service.</li>
      </ul>
      <p>We don't share your information with any other third party except as needed to provide the Service, comply with the law, or protect our rights.</p>

      <h2>4. Data Retention &amp; Deletion</h2>
      <p>We retain your account and business data for as long as your account is active, plus a reasonable period afterward in case you wish to reactivate. If you'd like your account or data deleted, contact us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a> and we'll take care of it — this is currently handled as a direct request rather than a self-serve option in the Service.</p>

      <h2>5. Your Rights</h2>
      <p>You can request access to, correction of, or deletion of your personal information by contacting us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>. If you're a client or contractor whose information was entered by one of our business customers, please reach out to that business directly — they control that data — or contact us and we'll help route your request.</p>

      <h2>6. Data Security</h2>
      <p>We take reasonable steps to protect your information, including encrypting data in transit, hashing passwords, and using secure, authenticated sessions to control access to your account. No system is perfectly secure, but we work to keep the Service safe.</p>

      <h2>7. Children's Privacy</h2>
      <p>GigWorks is a business tool and isn't directed at children. We don't knowingly collect information from anyone under 18.</p>

      <h2>8. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. If we make material changes, we'll take reasonable steps to let you know. The "Last updated" date at the top of this page reflects the most recent revision.</p>

      <h2>9. Contact</h2>
      <p>Questions about this Privacy Policy or your information? Reach us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
    </LegalPageLayout>
  );
}
