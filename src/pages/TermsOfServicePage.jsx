import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import LegalPageLayout from '../components/LegalPageLayout';
import { getLandingConfig } from '../lib/landing';

export default function TermsOfServicePage() {
  const [config, setConfig] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { getLandingConfig().then((data) => setConfig(data.config)).catch(() => setFailed(true)); }, []);

  if (failed) return <Navigate to="/" replace />;
  if (!config) return <div className="min-h-screen bg-slate-50" aria-busy="true" />;
  const { entityName, governingLaw, contactEmail } = config.legal;
  const trialDays = config.pricing?.trialDays ?? 14;

  return (
    <LegalPageLayout config={config} title="Terms of Service">
      <p>These Terms of Service ("Terms") govern your access to and use of GigWorks, a booking, staffing, and event-management platform for entertainment businesses (the "Service"), provided by {entityName} ("{entityName}," "we," "us," or "our"). By creating an account or otherwise using the Service, you agree to these Terms. If you're agreeing on behalf of a business, you're confirming you have the authority to bind that business, and "you" refers to that business.</p>

      <h2>1. Description of the Service</h2>
      <p>The Service helps entertainment businesses — bands, DJs, orchestras, agencies, and bandleaders — manage the full lifecycle of a gig: client inquiries, proposals, e-signature contracts, invoicing and payment collection, contractor rosters and confirmations, day-of production tools (stage plots, set lists, prep sheets), and financial tracking.</p>

      <h2>2. Eligibility</h2>
      <p>The Service is intended for business and professional use, not personal or household use. You must be at least 18 years old and able to form a binding contract to create an account.</p>

      <h2>3. Your Account</h2>
      <p>You're responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Provide accurate information when registering, and let us know promptly at {contactEmail} if you believe your account has been compromised. An account owner may invite team members and control what each one can access within the Service.</p>

      <h2>4. Subscription Plans, Billing &amp; Free Trial</h2>
      <p>Paid plans are billed on a recurring basis (monthly or annual, depending on what you select) through our payment processor, Stripe. New accounts may start with a {trialDays}-day free trial; you won't be charged until the trial ends unless you cancel first. You can cancel your subscription at any time, effective at the end of the current billing period — we don't provide refunds or credits for partial billing periods. Prices and plan features are shown on our pricing page and may change with notice.</p>

      <h2>5. Payment Processing for Your Own Clients and Contractors</h2>
      <p>The Service lets you invoice your own clients and collect payment through Stripe Connect, directly into your own connected Stripe account. {entityName} is not a party to the transactions between you and your clients, does not take custody of those funds, and is not responsible for your compliance with tax, consumer-protection, or other laws that apply to your own business. Your use of Stripe is additionally governed by Stripe's own terms of service.</p>

      <h2>6. Your Business Data</h2>
      <p>You retain ownership of the data you enter into the Service — your clients, contractors, venues, bookings, events, and financial records ("Your Data"). You're responsible for the accuracy of Your Data and for having the right to store and process it (including your own clients' and contractors' personal information) within the Service. We act as a service provider processing Your Data on your behalf, as described in our <Link to="/privacy">Privacy Policy</Link>.</p>

      <h2>7. Acceptable Use</h2>
      <p>You agree not to: use the Service for anything illegal or fraudulent; attempt to gain unauthorized access to the Service or other accounts; interfere with or disrupt the Service's operation; reverse-engineer or attempt to extract the Service's source code; or use the Service to send unsolicited communications in violation of applicable law.</p>

      <h2>8. Intellectual Property</h2>
      <p>{entityName} owns the Service, including its software, design, and branding. Nothing in these Terms transfers any of that to you. You retain all rights to Your Data and any content you create using the Service.</p>

      <h2>9. Electronic Signatures</h2>
      <p>Contracts you send through the Service include their own Electronic Signature Consent clause, referencing the U.S. E-SIGN Act, at the point a client or contractor signs. That consent governs the specific document being signed; these Terms don't separately restate it.</p>

      <h2>10. Service Availability &amp; Disclaimers</h2>
      <p>We aim to keep the Service available and reliable, but we don't guarantee uninterrupted or error-free operation. The Service is provided "as is" and "as available," without warranties of any kind, express or implied, to the fullest extent permitted by law.</p>

      <h2>11. Limitation of Liability</h2>
      <p>To the fullest extent permitted by law, {entityName} won't be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or revenue, arising from your use of the Service. Our total liability for any claim relating to the Service is limited to the amount you paid us in the twelve months before the claim arose.</p>

      <h2>12. Suspension &amp; Termination</h2>
      <p>We may suspend or disable an account that violates these Terms, and access to the Service is automatically restricted if a subscription lapses or payment fails. You can stop using the Service at any time by canceling your subscription. Upon termination, your right to access the Service ends, though we'll retain Your Data for a reasonable period in case you wish to reactivate, subject to our <Link to="/privacy">Privacy Policy</Link>.</p>

      <h2>13. Changes to These Terms</h2>
      <p>We may update these Terms from time to time. If we make material changes, we'll take reasonable steps to let you know (such as an email or an in-app notice). Continuing to use the Service after changes take effect means you accept the updated Terms.</p>

      <h2>14. Governing Law</h2>
      <p>These Terms are governed by the laws of {governingLaw}, without regard to its conflict-of-law principles.</p>

      <h2>15. Contact</h2>
      <p>Questions about these Terms? Reach us at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</p>
    </LegalPageLayout>
  );
}
