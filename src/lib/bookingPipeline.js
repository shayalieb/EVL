// Shared derivation of a Booking's real pipeline stage — pure functions, no
// React. Originally lived only in BookingFormPage.jsx (feeding its own
// PipelineStepper), which meant the one place that showed genuine progress
// (proposal sent, contract signed, event created, invoice paid) was
// invisible everywhere else — the Bookings list, filters, and dashboard all
// showed a completely separate, manually-set `bookingStatus` badge instead,
// with nothing keeping the two in sync. Extracted here so every view that
// wants to show "where is this booking really at" derives it the same way,
// rather than each screen inventing its own notion of status.
export function pipelineSteps(booking, proposal, contract, invoices) {
  const proposalSent = !!proposal?.sentAt;
  const contractSent = !!contract;
  const fullySigned = contract?.status === 'fully_signed';
  const hasEvent = !!booking?.convertedEventId;
  const invoicePaid = (invoices || []).some((inv) => inv.status === 'paid');
  const invoiceAwaitingPayment = (invoices || []).some((inv) => inv.status === 'sent' || inv.status === 'partial');
  const state = (done, current) => (done ? 'done' : current ? 'current' : 'upcoming');
  return [
    { label: 'Booking', state: state(!!booking, !booking) },
    { label: 'Proposal', state: state(proposalSent, !!booking && !proposalSent) },
    { label: 'Contract', state: state(contractSent, proposalSent && !contractSent) },
    { label: 'Signed', state: state(fullySigned, contractSent && !fullySigned) },
    { label: 'Event', state: state(hasEvent, fullySigned && !hasEvent) },
    { label: 'Payment', state: state(invoicePaid, invoiceAwaitingPayment && !invoicePaid) },
  ];
}

// The single step a `pipelineSteps` result is currently sitting on — 'done'
// on every step means fully complete (payment received), so that's reported
// as the last step rather than "nothing current".
export function currentPipelineStep(steps) {
  return steps.find((s) => s.state === 'current') || steps[steps.length - 1];
}

// Quick-glance status badges shown at the top of the Booking detail page,
// alongside PipelineStepper — same underlying data (proposal.sentAt,
// contract.status) as the stepper and each tab's own status banner, just
// surfaced where a stakeholder can see it without clicking into either tab.
export function proposalStatusInfo(proposal) {
  if (!proposal) return { label: 'Not Started', color: '#94a3b8' };
  if (!proposal.sentAt) return { label: 'Draft', color: '#94a3b8' };
  return { label: 'Sent', color: '#22c55e' };
}

export function contractStatusInfo(contract) {
  if (!contract) return { label: 'Not Started', color: '#94a3b8' };
  if (contract.status === 'fully_signed') return { label: 'Fully Signed', color: '#22c55e' };
  if (contract.status === 'client_signed') return { label: 'Awaiting Your Signature', color: '#eab308' };
  if (contract.status === 'owner_signed') return { label: 'Awaiting Client Signature', color: '#eab308' };
  return { label: 'Awaiting Signatures', color: '#eab308' }; // status === 'sent'
}
