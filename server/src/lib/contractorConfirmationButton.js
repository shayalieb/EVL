const TOKEN = /\{\{ContractorConfirmationButton\}\}/g;

export function hasContractorConfirmationButton(body) {
  return String(body || '').includes('{{ContractorConfirmationButton}}');
}

export function renderContractorConfirmationButton(body, buttonHtml = '') {
  return String(body || '').replace(TOKEN, buttonHtml);
}
