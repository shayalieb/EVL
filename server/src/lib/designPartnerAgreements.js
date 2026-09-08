// Legal document templates for the design partner / test user program (see
// server/prisma/schema.prisma's DesignPartnerAgreement model and
// membership.js's attachMembership for the access gate these back).
//
// ⚠️ These are solid, clearly-structured drafts — not a substitute for
// review by a real attorney before use with actual design partners. The
// non-compete in particular is drafted narrowly (tied to use of
// confidential information gained through the program, not a blanket
// industry restriction) specifically because non-compete enforceability
// varies enormously by state — several states void them outright for
// workers, others restrict them heavily. Have counsel review the final
// text, especially for any signer in a state with such restrictions.
//
// Same exact clause already used for client-facing Contract e-signatures
// (src/pages/BookingFormPage.jsx's ESIGN_SECTION_TEXT) — kept verbatim
// identical here for consistency across every e-signed document in the app.
const ESIGN_CONSENT_TEXT = 'By signing this document electronically, all parties agree that their electronic signature is the legal equivalent of a handwritten signature, and consent to conduct this transaction electronically. Electronic records of this agreement are as valid, binding, and enforceable as a signed paper original, consistent with the U.S. Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state law.';

export function buildNdaText({ signerName, entityName, governingLaw, contactEmail }) {
  return `MUTUAL NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement ("Agreement") is entered into between ${entityName} ("Company") and ${signerName} ("Design Partner") in connection with the Design Partner's early access to Company's GigWorks software (the "Program").

## 1. Confidential Information
"Confidential Information" means any non-public information disclosed by either party in connection with the Program, including but not limited to: unreleased features, source code, technical designs, business plans, pricing, roadmaps, user data made visible during testing, and any materials marked or reasonably understood to be confidential.

## 2. Obligations
The receiving party will use Confidential Information solely to participate in the Program and provide feedback to Company, will not disclose it to any third party, and will protect it using at least the same care it uses for its own confidential information, and no less than reasonable care.

## 3. Exclusions
Confidential Information does not include information that: is or becomes publicly available through no fault of the receiving party; was already known to the receiving party without an obligation of confidentiality; is independently developed without use of the other party's Confidential Information; or must be disclosed by law or court order, provided the disclosing party is given prompt notice where legally permitted.

## 4. Term
The confidentiality obligations in this Agreement remain in effect for two (2) years from the date this Agreement is signed below, regardless of whether the Design Partner's participation in the Program ends sooner.

## 5. Feedback
Any feedback, suggestions, or ideas the Design Partner provides about the Program may be used by Company for any purpose, including improving GigWorks, without payment or attribution obligation to the Design Partner.

## 6. No Warranty
Access provided under the Program is offered "as is," without warranty of any kind, for the purpose of evaluation and feedback.

## 7. Return of Materials
Upon Company's request or the end of the Design Partner's participation in the Program, the Design Partner will return or destroy all materials containing Company's Confidential Information in its possession.

## 8. Governing Law
This Agreement is governed by the laws of ${governingLaw}, without regard to conflict-of-law principles.

## 9. Severability
If any provision of this Agreement is found unenforceable, that provision will be limited or eliminated to the minimum extent necessary, and the remaining provisions will remain in full force and effect.

## 10. Electronic Signature Consent
${ESIGN_CONSENT_TEXT}

## 11. Contact
Questions about this Agreement may be directed to ${contactEmail}.`;
}

export function buildNonCompeteText({ signerName, entityName, governingLaw, contactEmail }) {
  return `NON-COMPETE AND NON-SOLICITATION AGREEMENT

This Agreement is entered into between ${entityName} ("Company") and ${signerName} ("Design Partner") in connection with the Design Partner's early access to Company's non-public GigWorks software and related confidential business information (the "Program").

## 1. Background
In connection with the Program, Company is providing the Design Partner with access to confidential, non-public information about GigWorks, including unreleased features, product strategy, and business plans. This Agreement protects that access from being used to compete with Company.

## 2. Restricted Activity
During the Design Partner's participation in the Program, and for two (2) years after that participation ends, the Design Partner agrees not to develop, launch, operate, or materially assist a product or service that directly competes with GigWorks, to the extent such activity uses or is materially informed by Confidential Information (as defined in the accompanying Non-Disclosure Agreement) obtained through the Program. This restriction does not prohibit the Design Partner from working in the entertainment, events, or software industries generally, or from building or working on a competing product developed without use of such Confidential Information.

## 3. Non-Solicitation
For the same two (2) year period, the Design Partner agrees not to solicit Company's customers or employees for a competing product or service, using contacts or information obtained through the Program.

## 4. Reasonableness
The Design Partner acknowledges that this restriction is narrow in scope — tied specifically to use of Confidential Information obtained through the Program, not a general restriction on employment or business activity — and reasonable given the access to non-public information granted under the Program.

## 5. Severability
If any provision of this Agreement is found unenforceable or overly broad under the law of the Design Partner's jurisdiction, it will be narrowed to the maximum extent enforceable under that law, rather than invalidating the remainder of this Agreement. Where a jurisdiction's law voids restrictions of this kind entirely, this Agreement will be enforced only to the extent that law allows.

## 6. Governing Law
This Agreement is governed by the laws of ${governingLaw}, without regard to conflict-of-law principles, except where the mandatory law of the Design Partner's own jurisdiction otherwise applies to the enforceability of Section 2 or 3.

## 7. Electronic Signature Consent
${ESIGN_CONSENT_TEXT}

## 8. Contact
Questions about this Agreement may be directed to ${contactEmail}.`;
}

// Returns both documents, frozen and ready to store — called once, at
// invite-creation time, from admin.js's createInvitedUser.
export function buildAgreementDocuments({ signerName, entityName, governingLaw, contactEmail }) {
  const params = { signerName, entityName, governingLaw, contactEmail };
  return [
    { type: 'nda', documentText: buildNdaText(params) },
    { type: 'non_compete', documentText: buildNonCompeteText(params) },
  ];
}
