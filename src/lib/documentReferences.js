// These references use the actual database IDs. Every version in a contract
// chain carries its original contract ID, so a reference can always be
// resolved back to the exact stored document without a separate counter.
export function contractReference(contract, history = []) {
  if (!contract?.id) return '';
  if (contract.documentNumber) return contract.documentNumber;
  const byId = new Map(history.map((item) => [item.id, item]));
  let root = contract;
  for (let hop = 0; hop < 50 && root.previousContractId && byId.has(root.previousContractId); hop += 1) {
    root = byId.get(root.previousContractId);
  }
  const rootId = contract.rootContractId || root.id;
  const base = `GW-C-${rootId}`;
  return `${base}-${contract.documentType === 'addendum' ? 'A' : 'V'}${contract.revisionNumber || 1}`;
}

export function proposalReference(proposal) {
  return proposal?.documentNumber || (proposal?.id ? `GW-P-${proposal.id}` : '');
}
