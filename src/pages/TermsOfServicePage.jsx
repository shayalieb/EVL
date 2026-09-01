import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import { getLandingConfig } from '../lib/landing';
import LegalDocumentContent from '../components/LegalDocumentContent';

export default function TermsOfServicePage() {
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { getLandingConfig().then((data) => setConfig(data.config)).catch(() => setFailed(true)); }, []);

  if (failed) return <Navigate to="/" replace />;
  if (!config) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  const trialDays = config.pricing?.trialDays ?? 14;
  const values = { ...config.legal, trialDays };

  return (
    <LegalPageLayout config={config} title="Terms of Service">
      <LegalDocumentContent content={config.legal.termsOfServiceContent} values={values} />
    </LegalPageLayout>
  );
}
