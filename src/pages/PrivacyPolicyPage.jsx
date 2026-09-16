import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import { getLandingConfig } from '../lib/landing';
import LegalDocumentContent from '../components/LegalDocumentContent';

export default function PrivacyPolicyPage() {
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { getLandingConfig().then((data) => setConfig(data.config)).catch(() => setFailed(true)); }, []);

  if (failed) return <Navigate to="/" replace />;
  if (!config) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  const values = { ...config.legal, trialDays: config.pricing?.trialDays ?? 14 };

  return (
    <LegalPageLayout config={config} title="Privacy Policy">
      <LegalDocumentContent content={config.legal.privacyPolicyContent} values={values} />
      <section className="mt-8 space-y-3"><h2 className="text-xl font-semibold">Google venue search</h2><p>Gigworks includes an optional Google Maps venue search. When you use it, your search text and selected country are sent to Google. Google results are displayed temporarily and are not saved to your booking.</p><p>Use of this feature is subject to the <a className="underline" href="https://maps.google.com/help/terms_maps/">Google Maps/Google Earth Additional Terms of Service</a> and <a className="underline" href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p></section>
    </LegalPageLayout>
  );
}
