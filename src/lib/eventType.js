// Shared by EventFormPage.jsx and InquiryFormPage.jsx — both conditionally
// show Bride's/Groom's Name fields only for wedding-type events. A plain
// case-insensitive match against the free-text eventType value (accounts
// can add their own event types via addEventType, so this isn't a fixed
// enum) rather than a strict equality check, since "Wedding"/"wedding" both
// clearly mean the same thing to whoever typed it.
export function isWedding(eventType) {
  return (eventType || '').trim().toLowerCase() === 'wedding';
}
