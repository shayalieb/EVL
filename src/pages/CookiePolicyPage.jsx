import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import { getLandingConfig } from '../lib/landing';

export default function CookiePolicyPage() {
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { getLandingConfig().then((data) => setConfig(data.config)).catch(() => setFailed(true)); }, []);

  if (failed) return <Navigate to="/" replace />;
  if (!config) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  const { entityName, contactEmail, effectiveDate } = config.legal;

  return (
    <LegalPageLayout config={config} title="Cookie Policy">
      <p>This Cookie Policy explains how {entityName} uses cookies and similar browser storage when you use GigWorks (the "Service").</p>

      <h2>1. Essential Cookies We Use</h2>
      <p>We use a small number of cookies, all essential to signing in and using the Service — none of them are used for advertising:</p>
      <ul>
        <li>A session cookie that keeps you signed in to your business account as you move around the Service.</li>
        <li>A separate session cookie used only on the client/contractor-facing pages (like signing a contract or paying an invoice), so those flows don't require the person on the other end to have an account at all.</li>
      </ul>
      <p>Both are strictly necessary — without them, you couldn't stay logged in or complete an action like signing a contract.</p>

      <h2>2. Local Browser Storage</h2>
      <p>When you're partway through filling out a new booking or event, the Service saves a draft in your browser's local session storage so you don't lose your work if the page reloads. That draft stays on your own device, is never sent to any third party, and is cleared automatically once you save or submit the form.</p>

      <h2>3. No Advertising or Analytics Cookies</h2>
      <p>As of {effectiveDate}, GigWorks does not use any third-party advertising or analytics cookies or trackers. If that changes in the future, we'll update this policy to reflect it.</p>

      <h2>4. Managing Cookies</h2>
      <p>Most browsers let you block or delete cookies through their settings. Since the cookies we use are essential to signing in, blocking them will prevent the Service from working — you won't be able to stay logged in or complete client-facing flows like contract signing or invoice payment.</p>

      <h2>5. Changes to This Policy</h2>
      <p>We may update this Cookie Policy from time to time. The "Last updated" date at the top of this page reflects the most recent revision.</p>

      <h2>6. Contact</h2>
      <p>Questions about this Cookie Policy? Reach us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
    </LegalPageLayout>
  );
}
