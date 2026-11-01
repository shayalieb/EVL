# UI audit: inquiry to end of event (2026-11-01)

**Method.** Walked the whole lifecycle in a real browser (Chromium via Playwright) against the current `main` code on a throwaway database, at desktop (1440×900, plus 1366×768 for the sidebar) and phone (390×844) sizes. Outgoing email was captured locally, so no provider was contacted. I acted as the owner and as the client.

Path covered: public inquiry form → owner review → booking → proposal (send, client accepts) → contract (send, client signs, owner countersigns) → deposit invoice (send, client view) → auto-created event → event tabs → payment → mark event complete.

Each finding says how it was confirmed: **Verified** (reproduced, plus database or code check), **Observed** (seen in a screenshot only), or **Automated** (found by my scan, not hand-checked).

No application code was changed by the audit itself.

**Status update.** The four items under "Fix first" were fixed afterwards and are covered by tests (`server/integration-tests/launchBlockers.integration.js`, `e2e/launch-blockers.spec.js`). Each is marked **FIXED** below with what changed. Everything else is still open.

---

## Fix first

### 1. The Home page is dead for any account with a sent invoice that has a due date: Verified, pre-existing — FIXED

**Fixed:** `dashboard.js` now treats the due date as a `Date`. The error mapping also only counts a TypeError as the caller's fault when the request actually carried a query, body or path parameter, so a plain GET that crashes is a 500 again.
After the first invoice with a due date is sent, Home shows only the heading and the text "Invalid request."; every widget is gone. See `chk5_home_after_invoice.png`.

- **Cause.** `server/src/routes/dashboard.js:127` and `:129` call `.slice()` and `.localeCompare()` on `invoice.dueDate`. In the database that column is `DateTime`, so Prisma returns a `Date`, and `slice` throws `TypeError: i.dueDate.slice is not a function`. I confirmed that against the audit database.
- **Why tests missed it.** The e2e seed only has invoices with no due date.
- **It was already broken before my security work.** The route was last touched in an earlier commit; it used to return 500. My `clientFaultResponse` heuristic (the "wrong-type string method TypeError → 400" rule) now turns it into a 400 "Invalid request.", which is the wrong status for a server bug. Sentry's handler still runs first, but anything alerting on 5xx will no longer see it.
- **Likely live in production** for every customer who has sent an invoice with a due date. Worth checking Sentry for `dueDate.slice` or `/api/dashboard`.
- **Fix.** Compare dates as `Date` objects or ISO strings in dashboard.js. Separately, narrow or remove the TypeError → 400 rule, since it can hide server bugs.

### 2. A failed email still marks the proposal "Sent": Verified — FIXED

**Fixed:** if the email fails, the browser withdraws the proposal through a new `POST /proposal-responses/:id/rollback` (only for an unanswered proposal sent in the last 15 minutes), restores any earlier proposal it had replaced, and tells the owner nothing was recorded. The proposal routes also now require booking permission to send or withdraw; a member with every permission off could send proposals before.
`BookingFormPage.jsx:1129-1145` creates the sent record, then sends the email. If the email fails, the record stays. After a failed send I saw:
- a red toast "Email sending is not configured yet."
- the status badge "Proposal: Sent" and the workflow stage moving on to Contract
- a "Proposal sent" entry in the log and a proposal document row, `#100005`, "Sent Nov 1"
- the line "Not sent yet." under the Send button, contradicting all of the above
- a document number consumed (database row `status = sent`, `sentAt` set)

The client never received anything, but the owner's screens say they did. In production this happens on any Resend outage. See `p12_d_send_empty_proposal.png`. I did not check whether contract and manual-send flows share this pattern.

### 3. Internal booking notes are printed on the client's contract and PDF: Verified (rendering) / code-read (owner-typed notes) — FIXED

**Fixed:** notes are no longer put into new proposal or contract snapshots or into the proposal PDF, including when a contract is built from a proposal accepted before the fix. The Notes field now says it is private. Documents already sent keep what they contained.
The contract page shows a "Notes" section with the booking's Notes field (`ContractDocument.jsx:244`, `contractPdf.js:195`). The booking form labels that field "Notes" under "Notes & Activity", with no hint it is client-visible.
- **Seen in the audit.** The inquiry flow writes "From inquiry form: …" into that field, and it appeared on the client contract. See `p20_m_sign_ready.png`.
- **Risk.** Anything an owner types as a private note (for example "pays late, get deposit up front") would be printed on the contract the same way.
- **Fix options.** Rename it or label it as client-visible, or stop printing it on the contract unless the owner opts in.

### 4. Mark Paid and the financial views disagree: Verified — FIXED (revenue headline still open)

**Fixed:** "Mark Paid" on a deposit now asks first, and when exactly one open invoice matches the deposit amount it records that invoice as paid too (updating collected and the payment ledger). The page also refreshes immediately instead of showing "due in N days" until reload, and invoice rows show their number. **Still open:** the revenue headline and "projected" profit exclude unsent draft invoices, and the screen does not show the signed contract value.
On the event Financials tab, "Mark Paid" flips the booking's deposit to "$500.00 deposit — paid", but:
- "$0.00 collected so far" is unchanged
- invoice #100008 stays "Sent" in the database, with `paidAmount` still empty
- the invoice list still shows "Sent"

There is no confirmation, amount, date or method. See `chk8_before.png`. This overlaps your planned Financials Revenue Parity work, but the user-visible contradiction exists today.

The same screen headlines revenue of "$500.00" and "Net Profit $500.00 (100.0% margin) PROJECTED" for a $4,700 signed contract, because the other $4,200 is a draft invoice. The invoice rows are two identical "Jordan Rivera" lines with no invoice numbers. Observed.

---

## High: client-facing and money screens

### 5. The invoice is hard to read on a phone: Verified
The line-item table keeps its Qty and Rate columns (two "—" cells) at full width, so the description is squeezed into a column about 80px wide and wraps one word per line, 15 lines tall. See `p25_m_invoice_public.png`. This is the first thing a client sees on their phone when they open an invoice.

### 6. An invoice sent without online payment gives the client no way to pay: Verified
With "Accept Payment" off, the public invoice shows "Total Due $500.00" and "Thank you for your business!" and nothing else. There are no payment instructions, no pay button and no mention of how to pay. The memo is the only place an owner could add instructions, and nothing prompts them to.

### 7. "Accept Payment" is on by default but Stripe is usually not connected: Verified
Every new owner's first "Send Invoice" fails with the server message "Connect your Stripe account in Settings → Billing before sending invoices, or turn off Accept Payment…". The message is clear, but it is a dead end on the first attempt. A failed send also leaves a draft behind. Consider defaulting it off until Stripe is connected, or adding a "Go to Billing" button in the error. See `chk3_after_click.png`.

### 8. An empty $0 proposal can be sent with no confirmation: Verified
"Send Proposal" works with no offerings and a $0.00 total. It goes straight out, with no "are you sure" and no recipient confirmation.

### 9. The mobile contract signing screen is cramped: Verified
- The consent checkbox panel sits behind the fixed bottom "Sign Contract" bar, so its text is clipped until the client scrolls.
- The disabled Sign button gives no reason it is disabled.
- The header squeezes "E2E Events / Contract for Jordan Rivera" into a narrow column beside the Download button.
- The hint "Sign above with your mouse, trackpad, or finger" collides with the "Clear" link.

See `p20_m_sign_ready.png` and `p18_m_contract_public.png`.

---

## Medium

| # | Finding | Evidence |
|---|---|---|
| 10 | **Contract link expiration is below the Send button** (above it on the Proposal tab). Easy to send with the default 30 days. | `p16_d_contract_tab.png` |
| 11 | **The owner gets two emails when a proposal is accepted:** "Jordan Rivera accepted your proposal" and "Reminder: Jordan Rivera accepted your proposal…". | Captured mail log |
| 12 | **The new-inquiry email subject is a sentence:** "New inquiry: Review the new inquiry from Jordan Rivera and apply it to a booking." | Captured mail log |
| 13 | **Applying an inquiry names the booking just "Wedding"** (the event type) rather than something like "Jordan Rivera Wedding". The auto-created event is named "Jordan Rivera Wedding", so the two names differ. | `p6_d_booking_after_apply.png` |
| 14 | **Pending inquiry rows are indistinguishable.** Two submissions both read "Jordan Rivera — Wedding on June 12, 2027" with only "Review"; no email, time or venue. | `p4_d_bookings_with_inquiry.png` |
| 15 | **Sidebar at laptop height.** At 1366×768 the Settings link is 154px below the visible screen. The sidebar does not scroll on its own, so the whole page must scroll, and the top header scrolls out of view. | `p8b_scrolled_1366x768.png` |
| 16 | **Phone header:** the "GigWorks" logo text touches the AI button. | `p1_m_home.png` |
| 17 | **Contract and invoice email gates show only the GigWorks logo.** The client sees no business name or contract title before confirming their email. Public pages also show the GigWorks logo in a white box instead of the owner's branding when no logo is set. | `p18_m_contract_public.png` |
| 18 | **Bookings table is cramped at 1440px.** Dates and names wrap, the Notes column is mostly dashes, and the row action icons (edit, complete, delete) are tiny and low-contrast. | `p4_d_bookings_with_inquiry.png` |
| 19 | **Auto-created event shows a "Status required" chip** in the list. The Event Note it fills in reads "…Estimated hours: 5 Contract total: $4,700.00" with no punctuation. | Observed |
| 20 | **Event page React warnings** on every tab: "`value` prop on input should not be null" and "changing a controlled input to be uncontrolled". Some field is initialised with null, and such a field can fail to clear. The contractor modal logs the opposite warning. | Console, Verified |
| 21 | **Login rate-limit message is vague:** "Too many attempts. Please try again later." (no time frame). Seen when my own test logins tripped the limit. | `chk7_login_ratelimited.png` |
| 22 | **Phone inputs use a font under 16px on every form** (booking, event, contractor, settings, inquiry), so iOS Safari zooms the page when a field is focused. | Automated (computed styles) |
| 23 | **Many form controls have no programmatic label** (the label text is next to the field but not associated): the booking form (22 fields), event form (23), settings (7), all list filter dropdowns, and the public inquiry form (16). Screen readers announce these as unlabelled. | Automated; not confirmed with a screen reader |

## Low

- **Proposal email** has the link as plain blue underlined text, not a button, and no event, date or amount in the body. `p15_email_proposal.png`
- **Every public page logs a 401** to the console (a session check on page load), including the client inquiry and proposal pages. Noise only.
- **Contractor modal:** Venmo and Zelle fields show even when the preferred method is "Not specified"; Category is required but a new account has none, so the user must add one first. `p28_m_contractor_modal.png`
- **The event "History" tab opens a modal** while Stage Plot opens a full-screen overlay and the others switch the page. Inconsistent.
- **Duplicate offerings** with the same name can be created without a warning.
- **Small tap targets on phones** (under 32px): row action icons, "Create Event →", "Review", "Find venue details", filter pills, 34 email-template field buttons.
- **11px text** in the sidebar section headings, and 10px stepper numbers.
- **Desktop Home stat cards:** values do not line up when a label wraps to two lines.
- **Redundant controls on the Invoices tab:** "Create Full Invoice" and "Create Deposit Invoice" at the top, plus a Deposit / Full contract toggle in the form below. The saved-invoice row shows Edit, Send, View PDF, Download, Mark Open, Mark Partial and Mark Paid with equal weight, and no confirmation on Mark Paid.
- **Booking page for an inquiry-created booking** still offers "Send Inquiry Link: send the client a secure link to fill in the event details themselves."
- **Agency groups page** (`/agency/groups`) returns 403 for this account and logs a console error (I did not check why).

---

## Things that worked well
- The public inquiry form: clear sections, correct required markers, phone formatting, good validation, clear thank-you screen, both sizes.
- The inquiry review modal, and the bookings → proposal → contract → invoice → event flow connecting automatically (event created on full signature).
- Proposal, contract and invoice public pages on desktop; the accepted state is clear and final.
- Email-confirmation gate on contracts rejects a wrong address with a clear message.
- The "Complete event" dialog offers to complete the booking too.
- Modals focus, close and render properly; no horizontal page overflow on any page I scanned at 390px.

## Not covered by this pass
- Contractor assignment, confirmation emails and the contractor calendar (`/gigs/…`)
- Guest RSVP, client prep form and portal pages as a client would use them
- Public stage plot and run-of-show share pages and their editors (the stage plot editor is covered by e2e)
- Review request, QuickBooks, Stripe checkout, Google Calendar and other provider flows
- The proposal **Preview** modal rendered blank in headless Chromium (likely the PDF viewer, which headless lacks), so it is unverified
- Real Safari and Firefox, and real phones; I only emulated a 390px Chromium
- Settings tab visuals: screenshots were taken and auto-scanned, but I did not review each one by eye

## How to reproduce
Run the app against a throwaway database (`createdb evl_ui_audit`, `prisma migrate deploy`, seed with `seedE2e`), start the API on 4100 and Vite on 4173, and walk the flow above. To exercise the email paths without a provider, point `RESEND_BASE_URL` at a local capture server (see `testing_environment_quirks` in memory).
