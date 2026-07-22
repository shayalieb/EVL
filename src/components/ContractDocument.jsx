import { useState } from 'react';
import SignatureCanvas from './SignatureCanvas';
import { formatCurrency as currency, formatEventDate, formatVenueLine } from '../lib/format';
import { computeOfferingTotal, computeOfferingsTotal } from '../lib/offerings';

const DEFAULT_ACCENT = '#4f46e5';

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-100 last:border-0 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium text-right">{value}</span>
    </div>
  );
}

function TableCard({ title, accent, children }) {
  return (
    <div className="mb-6">
      <div className="px-3 py-1.5 rounded-t-lg text-xs font-bold text-white uppercase tracking-wide" style={{ backgroundColor: accent }}>
        {title}
      </div>
      <div className="border border-t-0 border-slate-200 rounded-b-lg px-3 py-1">{children}</div>
    </div>
  );
}

function SignedSlot({ label, signature }) {
  return (
    <div>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{label}</div>
      <div className="border-b-2 border-slate-800 pb-2 mb-1.5 min-h-[56px] flex items-end">
        <img src={signature.image} alt={`${signature.name} signature`} className="h-12" />
      </div>
      <div className="text-sm font-semibold text-slate-700">{signature.name}</div>
      <div className="text-xs text-slate-400">Signed {formatEventDate(new Date(signature.signedAt).toISOString().slice(0, 10))}</div>
    </div>
  );
}

function AwaitingSlot({ label }) {
  return (
    <div>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">{label}</div>
      <div className="border-b-2 border-dashed border-slate-200 pb-2 mb-1.5 min-h-[56px]" />
      <div className="text-sm text-slate-300">Awaiting signature</div>
    </div>
  );
}

function SignHereSlot({ label, signerName, onSignerNameChange, onSignatureChange, signHereRef }) {
  return (
    <div ref={signHereRef} className="relative rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-3">
      <span className="absolute -top-3 left-3 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wide">
        Sign Here
      </span>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 mt-1">{label}</div>
      <input
        required
        value={signerName}
        onChange={(e) => onSignerNameChange(e.target.value)}
        placeholder="Type your full legal name"
        className="w-full mb-2 px-2.5 py-1.5 rounded-lg border border-slate-300 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      <SignatureCanvas onChange={onSignatureChange} height={110} />
    </div>
  );
}

export default function ContractDocument({ snapshot, terms, clientSignature, ownerSignature, role, canSignNow, signerName, onSignerNameChange, onSignatureChange, signHereRef }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const accent = snapshot.style?.accentColor || DEFAULT_ACCENT;
  const businessInfo = snapshot.businessInfo || {};
  const client = snapshot.client || {};
  const booking = snapshot.booking || {};
  const lineItems = snapshot.lineItems || [];
  const offeringsList = snapshot.offerings || [];
  const sections = (snapshot.sections || []).filter((s) => s.title);
  const customFields = (snapshot.customFields || []).filter((f) => f.label);
  const grandTotal = lineItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0) + computeOfferingsTotal(offeringsList);

  const clientSlot = client.firstName ? `${client.firstName} ${client.lastName || ''}`.trim() : 'Client';

  return (
    <div className="bg-slate-100 rounded-2xl p-2 sm:p-6">
      <div className="bg-white rounded-lg shadow-md mx-auto max-w-[800px] px-6 py-8 sm:px-12 sm:py-12">
        <div className="flex items-center gap-3 mb-6">
          {businessInfo.logo && !logoFailed && (
            <img src={businessInfo.logo} alt="" className="h-10 w-auto" onError={() => setLogoFailed(true)} />
          )}
          <div>
            <div className="font-bold text-slate-800">{businessInfo.name || 'Event Contract'}</div>
            <div className="text-xs text-slate-400">
              {[businessInfo.address, businessInfo.phone, businessInfo.email].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="h-0.5 rounded-full mb-8" style={{ backgroundColor: accent }} />

        <h1 className="text-2xl font-bold text-slate-800 text-center mb-6">{snapshot.title || 'Event Contract'}</h1>

        <div className="text-center mb-8">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Between</div>
          <div className="text-base">
            <span className="font-bold text-slate-800">{businessInfo.name || 'The Business'}</span>
            <span className="text-slate-400 mx-2 font-normal">and</span>
            <span className="font-bold text-slate-800">{clientSlot}</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {businessInfo.email && <span>{businessInfo.email}</span>}
            {businessInfo.email && client.email && <span className="mx-2">·</span>}
            {client.email && <span>{client.email}</span>}
          </div>
        </div>

        <TableCard title="Event Details" accent={accent}>
          <Row label="Event Type" value={booking.eventType || '—'} />
          <Row label="Event Date" value={booking.eventDate ? formatEventDate(booking.eventDate) : 'Tentative'} />
          <Row label="Location" value={formatVenueLine(booking.venue) || '—'} />
          <Row label="Estimated Hours" value={snapshot.hours ? `${snapshot.hours} hrs` : '—'} />
        </TableCard>

        <TableCard title="Pricing" accent={accent}>
          {lineItems.map((item) => (
            <Row key={item.id} label={item.name || 'Item'} value={currency(Number(item.amount) || 0)} />
          ))}
          <Row label={<span className="font-bold text-slate-800">Grand Total</span>} value={<span className="font-bold text-slate-800">{currency(grandTotal)}</span>} />
          <Row label="Deposit Amount" value={booking.depositAmount ? currency(booking.depositAmount) : '—'} />
          <Row label="Deposit Due Date" value={booking.depositDueDate ? formatEventDate(booking.depositDueDate) : '—'} />
        </TableCard>

        {offeringsList.length > 0 && (
          <TableCard title="Offerings" accent={accent}>
            {offeringsList.map((o) => {
              const total = computeOfferingTotal(o);
              const valueLine = o.type === 'perUnit' ? `${o.unitCount || 0} × ${currency(o.ratePerUnit || 0)} = ${currency(total)}` : currency(total);
              return (
                <div key={o.id} className="py-1.5 border-b border-slate-100 last:border-0 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">{o.name || 'Offering'}</span>
                    <span className="text-slate-800 font-medium text-right">{valueLine}</span>
                  </div>
                  {o.details && <div className="text-xs text-slate-400 mt-0.5">{o.details}</div>}
                </div>
              );
            })}
          </TableCard>
        )}

        {sections.map((section) => (
          <TableCard key={section.id} title={section.title} accent={accent}>
            {section.value && <div className="py-1.5 text-sm font-semibold text-slate-800">{section.value}</div>}
            {section.text && <div className="py-1.5 text-sm text-slate-600 whitespace-pre-wrap">{section.text}</div>}
          </TableCard>
        ))}

        {customFields.length > 0 && (
          <TableCard title="Additional Details" accent={accent}>
            {customFields.map((f, i) => <Row key={i} label={f.label} value={f.value || '—'} />)}
          </TableCard>
        )}

        {booking.notes && (
          <div className="mb-6">
            <div className="text-sm font-bold text-slate-700 mb-1.5">Notes</div>
            <div className="text-sm text-slate-600 whitespace-pre-wrap">{booking.notes}</div>
          </div>
        )}

        {terms && (
          <div className="mb-8">
            <div className="text-sm font-bold text-slate-700 mb-1.5">Terms</div>
            <div className="text-sm text-slate-600 whitespace-pre-wrap">{terms}</div>
          </div>
        )}

        <div className="h-px bg-slate-200 mb-6" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {role === 'client' && canSignNow ? (
            <SignHereSlot label="Client Signature" signerName={signerName} onSignerNameChange={onSignerNameChange} onSignatureChange={onSignatureChange} signHereRef={signHereRef} />
          ) : clientSignature ? (
            <SignedSlot label="Client Signature" signature={clientSignature} />
          ) : (
            <AwaitingSlot label="Client Signature" />
          )}

          {role === 'owner' && canSignNow ? (
            <SignHereSlot label="Business Signature" signerName={signerName} onSignerNameChange={onSignerNameChange} onSignatureChange={onSignatureChange} signHereRef={signHereRef} />
          ) : ownerSignature ? (
            <SignedSlot label="Business Signature" signature={ownerSignature} />
          ) : (
            <AwaitingSlot label="Business Signature" />
          )}
        </div>
      </div>
    </div>
  );
}
