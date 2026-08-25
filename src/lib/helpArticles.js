// Content for the in-app Help Center (src/pages/HelpPage.jsx). Plain data,
// not markdown — rendered by HelpArticleContent.jsx's small block renderer.
// Every UI label quoted here (button text, tab names, field names) should
// match the real app exactly, since these are meant to be followed
// step-by-step — if a button gets renamed, this needs updating too.
//
// Block shapes:
//   { type: 'p', text }       — a paragraph
//   { type: 'h', text }       — a subheading within the article
//   { type: 'steps', items }  — a numbered list (an ordered sequence)
//   { type: 'list', items }   — a bulleted list (unordered facts/options)
//   { type: 'tip', text }     — a positive callout (a shortcut, a good default)
//   { type: 'note', text }    — a caveat/gate to be aware of (permissions,
//                                what has to happen first, a limitation)
//   { type: 'image', src, alt, caption? } — a real screenshot of the app,
//                                served from public/help/ (see HelpArticleContent.jsx)

export const HELP_CATEGORIES = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    articles: [
      {
        id: 'welcome',
        title: 'Welcome to GigWorks',
        summary: 'The big picture — how Bookings, Events, and the day-of tools fit together.',
        blocks: [
          { type: 'p', text: "GigWorks is built around one core idea: a gig starts as a sales conversation and ends as a staffed, logistics-heavy event, and those are genuinely two different modes of work. The app splits them into two entities — Bookings and Events — that hand off to each other." },
          { type: 'h', text: 'The path a gig takes' },
          { type: 'steps', items: [
            "Someone inquires (through your Booking Link, or a link you send them) — see Get Inquiries Flowing In.",
            'You review the inquiry and turn it into a Booking — your sales pipeline record.',
            'You send a Proposal, then a Contract for e-signature.',
            'Once both sides sign, GigWorks automatically converts the Booking into an Event — no button to click.',
            "From there it's all operational: build the roster, send invoices, build the stage plot and set list, and run the day of.",
          ] },
          { type: 'p', text: "You don't have to start every gig this way — the \"+ Add Event\" button lets you create an Event directly for a walk-in gig with no sales pipeline at all." },
          { type: 'tip', text: "New here? Read Bookings vs. Events, Explained next — it's the one mental model that makes the rest of the app click." },
        ],
      },
      {
        id: 'setup',
        title: 'Set up your business',
        summary: 'The one-time setup in Settings before you start booking gigs.',
        blocks: [
          { type: 'p', text: 'Settings has a few tabs — most are things you\'ll set once and rarely touch again.' },
          { type: 'list', items: [
            'User Info — your own name, phone, and password.',
            'Business Info — your business name and branding, used as letterhead on proposals, contracts, and invoices.',
            'Custom Fields — the statuses you track contractors and bookings by (see Track Who\'s Confirmed for how these work).',
            'Templates — default content reused across new proposals and contracts.',
            'Users, Billing, Booking Link, and Email Domain — visible to account owners/admins only.',
          ] },
          { type: 'note', text: 'Users, Billing, Booking Link, and Email Domain only appear if you\'re an owner or admin on the account.' },
          { type: 'p', text: "Two of these are worth doing before your first real booking: connect Stripe under Billing (see Connect Stripe) so you can actually collect invoice payments, and set up your evergreen Booking Link under Booking Link (see Get Inquiries Flowing In) so inquiries can start coming in from your own website." },
        ],
      },
      {
        id: 'bookings-vs-events',
        title: 'Bookings vs. Events, explained',
        summary: 'The one distinction that makes the rest of the app make sense.',
        blocks: [
          { type: 'p', text: 'A Booking is the sales-pipeline stage — everything from a first inquiry through a signed contract. An Event is the operational stage — staffing, the stage plot, the set list, invoicing, and everything that happens the day of the gig. They\'re separate records, and one normally becomes the other.' },
          { type: 'h', text: 'How a Booking becomes an Event' },
          { type: 'list', items: [
            'Automatically, the moment a contract is signed by both sides — no button to click.',
            'Manually, any time, via the "Create Event →" button on a Booking\'s row on the Bookings page.',
          ] },
          { type: 'p', text: 'Once a Booking has become an Event, its own page turns read-only-ish and shows a "Converted to an event." banner with a "View Event" link — the Event is now where the real work happens.' },
          { type: 'image', src: '/help/bookings-list-converted.png', alt: 'The Bookings list showing a converted booking with a link to its Event', caption: 'A converted booking on the Bookings list — its Event column links straight to the Event it became.' },
          { type: 'tip', text: 'Skipping the sales pipeline entirely is fine — "+ Add Event" on the Events page creates one with no Booking behind it at all, useful for a walk-in or word-of-mouth gig.' },
        ],
      },
    ],
  },
  {
    id: 'roster',
    title: 'Your Roster',
    articles: [
      {
        id: 'add-contractor',
        title: 'Add a contractor',
        summary: 'Building out your musician roster with pricing tiers.',
        blocks: [
          { type: 'p', text: 'The Contractors page is your full roster — every musician, DJ, or vendor you book out, independent of any one event.' },
          { type: 'image', src: '/help/contractors-list.png', alt: 'The Contractors list, showing name, email, category, role, last contact, and price columns for each roster member' },
          { type: 'steps', items: [
            'Go to Contractors and click "+ Add Contractor."',
            'Fill in their name, contact info, instrument/role, and category.',
            'Add one or more pricing tiers — a rate for each way you might book them (e.g. a standard rate and an overtime rate).',
          ] },
          { type: 'p', text: "A contractor with more than one pricing tier gets a tier-picker whenever you add them to something — an event's roster, or a proposal/contract line item — so the right rate always gets used." },
          { type: 'image', src: '/help/contractor-modal.png', alt: 'The Add/Edit Contractor form, showing name/contact fields, the gig calendar link card, category, and pricing tiers' },
          { type: 'note', text: "Deleting a contractor doesn't touch anything already added to a past event, proposal, or contract — those keep whatever was true when they were added." },
        ],
      },
      {
        id: 'ensembles',
        title: 'Group contractors into an Ensemble',
        summary: 'Stop re-adding the same quartet to the roster one person at a time.',
        blocks: [
          { type: 'p', text: 'An Ensemble is a saved lineup — like "String Quartet" or "Wedding Trio" — that you build once on the Offerings page and reuse everywhere.' },
          { type: 'steps', items: [
            'Go to Offerings, scroll to the Ensembles section, and click "+ Add Ensemble."',
            'Name it, then add the specific contractors who make it up.',
            'Optionally set a Package Price. Leave it blank and it defaults to the sum of each member\'s own rate; set it and every use of this ensemble is priced at that flat rate instead.',
          ] },
          { type: 'image', src: '/help/ensemble-modal.png', alt: 'The Add Ensemble form, showing a name, a picker with three contractors added as chips, and a package price field' },
          { type: 'h', text: 'Two different ways to use it' },
          { type: 'list', items: [
            "On an event's roster — the \"+ Add Ensemble\" button adds every member as their own roster row, each with their own confirm/decline status.",
            "On a proposal or contract — added as a single priced line item through the offering picker's \"Add Ensemble\" option, shown to the client as the ensemble name plus a bulleted list of each member's instrument (never their name, so a swapped musician never contradicts a signed contract).",
          ] },
          { type: 'tip', text: "This is the fix for rebuilding the same lineup from scratch every gig — save it once, then it's a single click on every future roster or proposal." },
        ],
      },
      {
        id: 'roster-statuses',
        title: "Track who's confirmed",
        summary: 'Statuses, buckets, and what each roster row control does.',
        blocks: [
          { type: 'p', text: "Every contractor on an event's roster has a status — like Emailed, Called, or Confirmed — and every status belongs to one of three buckets: confirmed, tentative, or unavailable. The bucket is what actually drives the roster's color-coding and filtering, not the specific label." },
          { type: 'h', text: 'On each roster row' },
          { type: 'list', items: [
            'A status dropdown for the specific label (only shown when more than one status shares the current bucket).',
            'Three quick bucket buttons — "Confirmed," "Tentative," "Not Avail" — for fast reclassifying without opening the dropdown.',
            'An email-history icon (with an unread badge) and a template picker + "Send Email" button.',
            'A "Pay" button, once the row is in the Confirmed bucket, for logging what you paid that contractor — separate from client invoicing (see Deposits, Partial Payments & Manual Payments).',
          ] },
          { type: 'image', src: '/help/event-roster.png', alt: 'An event roster grouped by category, showing one contractor Confirmed (green) and two Tentative (amber), each with status dropdown, bucket buttons, and price' },
          { type: 'note', text: 'The default statuses (Added, Not Contacted, Emailed, Called, Confirmed, Not Available, Declined) can be renamed, recolored, or added to under Settings → Custom Fields.' },
        ],
      },
      {
        id: 'gig-calendar-link',
        title: 'The gig calendar link',
        summary: "Let contractors confirm or decline their own gigs — no login required.",
        blocks: [
          { type: 'p', text: "Every contractor gets their own bookmarkable link showing exactly their own upcoming gigs — no app account, no login." },
          { type: 'steps', items: [
            "Open the contractor from the Contractors page and find the \"Gig calendar link\" card.",
            '"Copy Link" to hand it to them yourself, or "Email Link" to send it directly (only enabled if they have an email on file).',
            'Two checkboxes — "Confirmed gigs" and "Pending gigs" — control what shows up on their calendar; both are on by default.',
          ] },
          { type: 'image', src: '/help/contractor-calendar-link.png', alt: 'The Gig calendar link card on a contractor\'s edit form, with Copy Link and Email Link buttons and two visibility checkboxes' },
          { type: 'p', text: "Gigs marked unavailable (declined, or marked Not Available) never show on their calendar, regardless of those two checkboxes." },
          { type: 'h', text: 'What the contractor can do' },
          { type: 'p', text: 'Their page shows each upcoming gig with call time, venue (with a map link), pay status, and notes. Anything still in the tentative bucket gets two buttons — "Accept Gig" and "Decline" — and tapping one is the only status change a contractor can make themselves; every other status stays under your control on the roster row.' },
          { type: 'tip', text: 'The page installs like an app (Add to Home Screen) and has a dark "Backstage Mode" toggle — built for checking from a phone backstage, not a desktop.' },
          { type: 'note', text: 'A "↻" button on the same card regenerates the link, which immediately invalidates the old one — use it if a link was shared somewhere it shouldn\'t have been.' },
        ],
      },
    ],
  },
  {
    id: 'pipeline',
    title: 'Clients & the Booking Pipeline',
    articles: [
      {
        id: 'clients-venues',
        title: 'Add clients & venues',
        summary: 'The two other roster-like lists you\'ll build out over time.',
        blocks: [
          { type: 'p', text: 'Clients and Venues work like Contractors — standalone lists you build out as you go, then reference from bookings and events rather than re-typing the same details every time.' },
          { type: 'p', text: 'You rarely need to add a client by hand, though — reviewing an inquiry (see Turn an Inquiry Into a Booking) creates one automatically, and matches to an existing client by email/phone instead of creating a duplicate.' },
          { type: 'image', src: '/help/clients-page.png', alt: 'The Clients list page, showing a client that was auto-created from a reviewed inquiry' },
        ],
      },
      {
        id: 'inquiries',
        title: 'Get inquiries flowing in',
        summary: 'Two ways for a prospective client to reach you, both landing in the same place.',
        blocks: [
          { type: 'h', text: 'Option 1 — your evergreen Booking Link' },
          { type: 'p', text: 'Set up once under Settings → Booking Link, this is a single link meant to live on your own website as a "Book with us" button. It never expires, and every visitor who fills it out creates a brand-new inquiry.' },
          { type: 'h', text: 'Option 2 — a per-recipient Send Inquiry Link' },
          { type: 'p', text: 'For a specific lead you\'re already talking to. Click "Send Inquiry Link" from the Bookings page (or from inside an already-open Booking), optionally enter their name/email, and click "Generate Link." If you gave an email it\'s sent automatically; either way you get a link with a "Copy" button, valid for 30 days.' },
          { type: 'note', text: 'Sending a per-recipient link from inside an already-open Booking merges their response into that Booking instead of creating a new one — useful for gathering more detail from someone you\'re already talking to.' },
          { type: 'image', src: '/help/send-inquiry-link-modal.png', alt: 'The Send Inquiry Link modal, with a generated link, a Copy button, and an emailed confirmation' },
          { type: 'p', text: "The form itself asks for the client's info, event date/type, venue details, and an optional description — whichever they fill in shows up for you to review next." },
          { type: 'image', src: '/help/public-inquiry-form.png', alt: 'The public inquiry form a prospective client fills out, with fields for their info, event date, and venue' },
        ],
      },
      {
        id: 'review-inquiry',
        title: 'Turn an inquiry into a booking',
        summary: 'Reviewing what came in and applying it.',
        blocks: [
          { type: 'p', text: 'Once someone submits an inquiry, the Bookings page shows a banner — "N new inquiry responses to review" — with a "Review" button per entry.' },
          { type: 'steps', items: [
            'Click Review to see everything they entered, read-only.',
            'If it matches an existing client by email or phone, you\'ll see a note that it\'ll link to that client instead of creating a duplicate.',
            'Click the action button — "Apply — Create Booking" for a new one, or "Apply — Update Booking" if this response came from a link sent out of an already-open booking.',
          ] },
          { type: 'image', src: '/help/review-inquiry-modal.png', alt: 'The Inquiry Response modal, showing the client\'s submitted info read-only, with Dismiss and Apply — Create Booking buttons' },
        ],
      },
      {
        id: 'proposals',
        title: 'Build and send a proposal',
        summary: 'Turning a booking into a client-ready document with pricing.',
        blocks: [
          { type: 'p', text: 'Open a Booking and go to its Proposal tab. If nothing exists yet, click "Push to Proposal" — it seeds a client-ready document from the booking\'s details and your account\'s default proposal template.' },
          { type: 'h', text: "What's in it" },
          { type: 'list', items: [
            'Your letterhead, the client\'s info, and an event summary.',
            'A Schedule section (only shown if you\'ve added schedule items).',
            'A Pricing section — offerings/ensembles and a deposit (fixed $ or % of total).',
            'An Additional Sections editor for riders/policies, with template save/load.',
          ] },
          { type: 'image', src: '/help/proposal-tab.png', alt: 'A Proposal tab showing an Ensemble line item priced at $850 (listing instruments, not names), a deposit section, and Additional Sections' },
          { type: 'steps', items: [
            'Use "Preview" to see it as the client will.',
            'Click "Send Proposal" — this emails the client a link to respond.',
            'If you handled it outside the app (printed it, handed it over in person), use the "…" menu\'s "Mark as Sent Manually" instead, with a short reason.',
          ] },
          { type: 'h', text: 'What the client sees' },
          { type: 'p', text: 'The same pricing/details, plus two buttons: "Accept Proposal" or "Request Revision" (which requires a note explaining what to change). Either way, they can change their mind afterward via a link on the confirmation screen — and a revision request surfaces back to you as a red banner on both the Bookings list and the Proposal tab.' },
        ],
      },
      {
        id: 'contracts',
        title: 'Contracts & e-signatures',
        summary: 'Locking in terms and getting both sides to sign.',
        blocks: [
          { type: 'note', text: 'The Contract tab needs a proposal with pricing on it first — it\'ll show "Push to Proposal" or "Go to Proposal" until that exists.' },
          { type: 'p', text: 'Once a priced proposal exists, "Move Proposal to Contract" appears. Terms are locked once sent — the pricing is copied from the Proposal (editable independently, without changing the Proposal itself), plus a Terms section that stays editable even after sending.' },
          { type: 'steps', items: [
            'Fill in the contract title, recipient, pricing, and terms.',
            'Click "Send Contract for Signature."',
          ] },
          { type: 'p', text: 'This generates two separate one-time signing links — one for the client, one for you — so you can countersign from your phone without needing to be logged in. The Contract tab tracks status as it happens: Waiting on signatures → Client signed — your turn to countersign (or You\'ve signed — waiting on the client, if you sign first) → Fully signed by both parties.' },
          { type: 'image', src: '/help/contract-tab-sent.png', alt: 'A Contract tab right after sending, showing "Waiting on signatures," copyable Client and Your links, a Terms box, and an in-app Your Signature card' },
          { type: 'h', text: 'Signing' },
          { type: 'p', text: 'Both sides sign on the same kind of page: type your full legal name, draw your signature, and click "Sign Contract." You (the owner) can also sign right inside the app on the Contract tab itself — in either order, whether the client has signed yet or not — instead of using the emailed link.' },
          { type: 'image', src: '/help/contract-sign-client-view.png', alt: 'The public contract signing page as the client sees it, with the full contract document and a Sign Here canvas' },
          { type: 'tip', text: 'An Electronic Signature Consent clause (citing the U.S. E-SIGN Act) is added to every new contract automatically — you don\'t need to write your own.' },
          { type: 'p', text: 'The moment both signatures are in, the Booking converts into an Event automatically, and the Contract tab shows a "View Event →" button plus a shortcut straight to invoicing.' },
          { type: 'image', src: '/help/contract-fully-signed.png', alt: 'A Contract tab showing "Fully signed by both parties," both signatures side by side, and a "Continue to Invoicing" button' },
        ],
      },
    ],
  },
  {
    id: 'offerings',
    title: 'Offerings & Pricing',
    articles: [
      {
        id: 'offerings-basics',
        title: 'Offerings: Flat Price vs. Per Unit',
        summary: 'Your reusable catalog of services and packages.',
        blocks: [
          { type: 'p', text: 'An Offering is a saved catalog item you can drop onto any proposal, contract, or invoice instead of typing the same line item from scratch every time. Manage them from the Offerings page.' },
          { type: 'h', text: 'Two pricing types' },
          { type: 'list', items: [
            'Flat Price — a flat amount.',
            'Per Unit — a unit count × a rate per unit (e.g. hours, guests), with the total computed automatically as you type.',
          ] },
          { type: 'image', src: '/help/offerings-page.png', alt: 'The Services & Packages page, listing saved Flat Price and Per Unit offerings with their values, plus the Ensembles section below' },
          { type: 'note', text: "Editing a saved Offering later never changes copies of it already sitting on a proposal, contract, or invoice — each copy is independent from the moment it's added." },
        ],
      },
      {
        id: 'adding-offerings',
        title: 'Adding pricing to a document',
        summary: 'The offering picker, and its four ways to add a line item.',
        blocks: [
          { type: 'p', text: 'Wherever you see "+ Add Offering" — on a Proposal, Contract, or Invoice — it opens the same picker with four options:' },
          { type: 'list', items: [
            'Pick an existing Offering from your saved catalog.',
            'Add a one-off "+ One-time item" — just a name and amount, never saved to the catalog.',
            'Create a brand-new Offering on the spot, which both adds it here and saves it to your catalog for next time.',
            'Add an Ensemble (proposals and contracts only) — see Group Contractors Into an Ensemble.',
          ] },
        ],
      },
    ],
  },
  {
    id: 'invoicing',
    title: 'Invoicing & Getting Paid',
    articles: [
      {
        id: 'connect-stripe',
        title: 'Connect Stripe',
        summary: 'One-time setup so invoices can actually collect payment.',
        blocks: [
          { type: 'p', text: 'GigWorks uses Stripe Connect — payments go directly into your own bank account, GigWorks never touches the money.' },
          { type: 'steps', items: [
            'Go to Settings → Billing (owners/admins only).',
            'Click "Connect Stripe" and complete Stripe\'s hosted onboarding.',
            'Come back and the button will read "Finish Onboarding" if anything\'s left, or you can click "Edit Stripe Details" once fully connected.',
          ] },
          { type: 'note', text: 'You can\'t send invoices until the Billing tab shows Connected — a status of Onboarding Incomplete means Stripe still needs more information from you.' },
          { type: 'image', src: '/help/settings-billing.png', alt: 'Settings → Billing, showing a Stripe Status badge reading "Not Connected" and a Connect Stripe button' },
        ],
      },
      {
        id: 'create-invoice',
        title: 'Create and send an invoice',
        summary: 'From a signed contract to money in the bank.',
        blocks: [
          { type: 'note', text: "Invoicing is locked until the booking's contract is fully signed by both sides — the Invoices tab will point you back to the Contract tab until then." },
          { type: 'p', text: 'Once unlocked, set your deposit (fixed $ or % of total, with a due date and a "Deposit paid" checkbox), then use whichever quick-create button fits:' },
          { type: 'list', items: [
            'Create Full Invoice — the whole grand total (before anything else has been invoiced).',
            'Create Deposit Invoice — pre-fills the deposit amount.',
            'Create Final Invoice — pre-fills whatever balance is left, once something\'s already been invoiced.',
          ] },
          { type: 'p', text: "Each one jumps you into the invoice composer: invoice number, recipient, due date, line items, a memo, and an \"Accept Payment\" checkbox. Leave that checked to let the client pay online via Stripe; turn it off if this invoice is being paid outside GigWorks, and it sends as a document only." },
          { type: 'image', src: '/help/invoice-composer.png', alt: 'The invoice composer, pre-filled with an Ensemble line item, recipient info, and an Accept Payment checkbox' },
          { type: 'steps', items: [
            '"Save Draft" to keep working on it — the client can\'t see it yet.',
            '"Send Invoice" to lock it and email the client a payment link.',
          ] },
          { type: 'p', text: "The client's payment page shows what's owed and a \"Pay $[amount] Now\" button that redirects to Stripe's own secure checkout. The moment payment succeeds, the invoice flips to Paid automatically — no manual step on your end." },
        ],
      },
      {
        id: 'manual-payments',
        title: 'Deposits, partial payments & manual payments',
        summary: 'Recording money that didn\'t come through Stripe.',
        blocks: [
          { type: 'p', text: "Not every payment goes through Stripe — a check, cash, or a card run outside the app all still need to be logged. On any invoice you can:" },
          { type: 'list', items: [
            '"Mark Paid" — opens Accept Payment: amount, date, method (ACH, Check, Credit/Debit Card, Other), and a memo.',
            '"Mark Partial" — a quick inline amount for a partial payment.',
            '"Mark Open" — reverts a paid/partial invoice back to sent, if you need to undo.',
            '"Void" — kills a sent/partial invoice without deleting the record.',
            '"Send Receipt" — appears once paid, for emailing the client a receipt.',
          ] },
          { type: 'image', src: '/help/invoice-history.png', alt: 'An Invoice History card showing a Draft invoice for $850, with Edit, Send, Download, Mark Open, Mark Partial, and Mark Paid buttons' },
          { type: 'tip', text: "The same Accept Payment flow, retitled \"Pay Contractor,\" is what the roster row's \"Pay\" button uses — that's a separate, informal log of what you paid a contractor (Zelle, cash, check), with no Stripe involved at all." },
        ],
      },
    ],
  },
  {
    id: 'day-of',
    title: 'Running the Event',
    articles: [
      {
        id: 'event-roster',
        title: 'Build the day-of roster',
        summary: 'Getting the right people confirmed for a specific event.',
        blocks: [
          { type: 'p', text: "On an Event's Contractors tab: \"+ Add Contractor\" opens everyone not already on the roster (a tier-picker appears first if they have more than one pricing tier); \"+ Add Ensemble\" clones an entire saved group onto the roster in one click, skipping anyone already there." },
          { type: 'p', text: "From there, use the status tools and \"Send Email\" per row — see Track Who's Confirmed for the full breakdown of statuses, buckets, and what each control does." },
          { type: 'image', src: '/help/event-roster.png', alt: 'An event roster grouped by category, showing contractors with different confirm statuses and their rates' },
        ],
      },
      {
        id: 'email-templates',
        title: 'Email your roster',
        summary: 'Reusable email content with merge fields for real event details.',
        blocks: [
          { type: 'p', text: "Email Templates (its own page) is where you write the content you'll send to contractors — a template gets picked from a dropdown on a roster row, next to that row's \"Send Email\" button." },
          { type: 'p', text: 'Each template has a name, subject, a "Sends As" display name, and a body you can edit visually (rich text) or as raw HTML.' },
          { type: 'h', text: 'Merge fields' },
          { type: 'p', text: 'The left-hand "Insert Fields" panel lists tokens you can drop into the subject or body — things like {{ContractorFirstName}}, {{EventDate}}, {{VenueFullAddress}}, {{CrewList}} (a bulleted list of everyone on the same category), and {{AddToCalendar}} (a calendar link). Click one to copy it, then paste it where you want that detail to appear.' },
          { type: 'note', text: 'Sending is always manual right now — picking a template and clicking Send on a roster row. There\'s no automatic trigger tied to a status change yet.' },
          { type: 'image', src: '/help/email-templates.png', alt: 'The Email Templates page, showing an expanded template with Subject/Body fields on the right and a searchable Insert Fields panel of merge tokens on the left' },
        ],
      },
      {
        id: 'stage-plot',
        title: 'Stage Plot',
        summary: 'A drag-and-drop canvas for exactly where everything goes on stage.',
        blocks: [
          { type: 'p', text: "From an event, open Stage Plot to place icons on a to-scale canvas — mics, amps, drums, keys, strings, brass & woodwind, DJ & Electronic, lighting, staging, seating, a Utility category (power strips, stage boxes, cable ramp), and a dedicated PA & AV category (speakers, line arrays, a mixing board, amp racks, LED walls, projectors)." },
          { type: 'list', items: [
            'Drag an icon from the palette onto the canvas, or tap one then tap the canvas to place it (touch-friendly).',
            'Click an icon to select it, then use the toolbar to rotate, duplicate, align, or delete.',
            'Cable Ramp, Drape/Backdrop, and Truss can be stretched to real length using their side handles — they redraw cleanly at any length instead of distorting.',
            'Undo/Redo, zoom controls, and a "Center All" button to fit everything in view live in the toolbar.',
          ] },
          { type: 'h', text: 'The Production List' },
          { type: 'p', text: "Placing an icon automatically adds a row to the Production List below the canvas — who's playing, their instrument, whether they need 48V phantom power or AC power, and notes. Click an icon to jump to its row, or the row's icon button to jump back to the canvas." },
          { type: 'p', text: 'There\'s also a Backline List for equipment the venue or band needs on hand (amps, risers, monitors) that isn\'t tied to a specific canvas icon.' },
          { type: 'image', src: '/help/stage-plot-production-list.png', alt: 'A stage plot canvas with several icons placed (line array, vocal mic, PA speaker, keyboard, drum kit, mixing board, cable ramp), and the Production List below with musician names and instruments filled in' },
          { type: 'tip', text: "Use the Email button to send the stage plot, Production List, and Backline List straight to your sound engineer or venue — check whichever sections you want included, and it also attaches a PDF." },
          { type: 'h', text: 'Reusing a plot for a similar gig' },
          { type: 'p', text: 'Playing the same venue again, with the same lineup? Click "Save to Library" to save this event\'s canvas, Production List, and Backline List for reuse — manage saved plots from the Stage Plots page. On a different event, click "+ Add from Library" to add a saved plot in: it appends as new pages plus the matching Production List and Backline List rows, alongside anything already on that event\'s stage plot, rather than replacing it.' },
          { type: 'note', text: 'Adding a saved plot to an event creates an independent copy — editing it afterward never touches the saved original, and editing the saved original later never changes copies already added to an event.' },
        ],
      },
      {
        id: 'set-lists',
        title: 'Set Lists',
        summary: 'A saved library, pulled into any event in one click.',
        blocks: [
          { type: 'p', text: "Set List Library (its own page) is where you build and save reusable songs/sets. On any event's Set Lists tab, click \"+ Add from Library\" to copy a saved set list straight in. Review the copy and save the event; editing it afterward never touches the saved original." },
          { type: 'p', text: "From there you can reorder songs, and send the finished set list by email with a PDF and any downloadable sheet-music links attached." },
          { type: 'image', src: '/help/setlist-editor.png', alt: 'A set list editor showing a "Reception" set list with three songs added' },
        ],
      },
      {
        id: 'prep-sheets',
        title: 'Prep sheets & schedules',
        summary: 'The logistics doc that ties a schedule to who\'s covering what.',
        blocks: [
          { type: 'p', text: 'An event\'s prep/schedule tools let you lay out the day\'s timeline and group requests/notes by category (band, photo, video, etc.) — the same schedule you build here is what a proposal\'s optional Schedule section pulls from.' },
        ],
      },
    ],
  },
  {
    id: 'staying-on-top',
    title: 'Staying on Top of Things',
    articles: [
      {
        id: 'reminders',
        title: 'Reminders',
        summary: 'Manual and recurring follow-ups, plus the conditions GigWorks watches automatically.',
        blocks: [
          { type: 'p', text: 'The Reminders page is a flat, filterable to-do list, each item optionally tied to a client, contractor, event, invoice, or booking. Click "+ Add Reminder" for a manual one, then search and pick the related record if you want one, a date and time (three "Quick set" buttons cover the common cases — Tomorrow, In 3 days, Next week), a note, and an optional "Email me when this reminder is due" checkbox.' },
          { type: 'h', text: 'Filtering the list' },
          { type: 'p', text: 'The status filter buttons — Open, Overdue, Completed — each show a live count. Open covers everything not yet completed, including anything overdue.' },
          { type: 'h', text: 'Recurring reminders' },
          { type: 'p', text: 'A manual reminder can repeat Daily, Weekly, or Monthly, with an optional end date. The next occurrence is created only when you mark the current one done. Delete the current open occurrence to stop the series.' },
          { type: 'h', text: "Things GigWorks flags on its own" },
          { type: 'list', items: [
            'Unconfirmed vendor — an event within a few days that still has at least one contractor who hasn\'t confirmed.',
            'Unsigned contract — an event within a few days whose contract still isn\'t fully signed.',
            'Deposit due — a booking\'s deposit due within a few days, or already overdue.',
            'Overdue invoice — a sent invoice a few days past its due date and still unpaid.',
            'Booking follow-up — a booking\'s own follow-up date has arrived.',
            'Event not marked complete — an event\'s date has passed and it\'s still not marked complete.',
            'Proposal awaiting response — a sent proposal that\'s gone several days without the client responding.',
          ] },
          { type: 'note', text: 'Each rule\'s exact threshold (how many days out or overdue it fires) is configurable under Settings → Reminder Rules, visible to owners/admins only. The list above uses each rule\'s default.' },
          { type: 'p', text: 'Auto-generated reminders go to the user who owns the reminder, falling back to the account owner when needed, and never duplicate no matter how often the check re-runs.' },
          { type: 'image', src: '/help/reminders-list.png', alt: 'The Reminders list, showing an open reminder tied to a client, with its date/time, note, and a Mark Done button' },
        ],
      },
      {
        id: 'dashboard',
        title: 'Your dashboard (Home)',
        summary: 'The at-a-glance view of where things stand.',
        blocks: [
          { type: 'p', text: 'Home leads with six stat tiles: Total Events, Upcoming Events, Upcoming Costs (total contractor cost across your upcoming events), Total Clients, Total Contractors, and how many gigs Needs Confirmation.' },
          { type: 'list', items: [
            'Overdue Invoices and At-Risk Events — two of the seven conditions Reminders watches for automatically, surfaced right on the dashboard too.',
            'Upcoming Events — your actual next gigs, with each contractor status shown inline.',
            'Top Contractors — who you book most, by number of bookings.',
            'Clients Needing Follow-up — anyone with an open reminder against them.',
          ] },
          { type: 'image', src: '/help/home-dashboard.png', alt: 'The Home dashboard, showing stat tiles, Overdue Invoices, At-Risk Events, Upcoming Events, Top Contractors, and Clients Needing Follow-up' },
        ],
      },
    ],
  },
];

// Flat list — used for the Help Center's search box (title/summary match)
// and for resolving a ?article= deep link without knowing its category.
export const HELP_ARTICLES_FLAT = HELP_CATEGORIES.flatMap((c) => c.articles.map((a) => ({ ...a, categoryId: c.id, categoryTitle: c.title })));
