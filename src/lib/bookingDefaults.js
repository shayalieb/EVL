import { uid } from './storage';

export function emptyVenue() {
  return {
    name: '', address1: '', address2: '', city: '', state: '', zip: '', locationNote: '', loadInInfo: '',
    contactName: '', contactPhone: '', contactPhoneExt: '', contactEmail: '',
  };
}

function emptyScheduleItem() {
  return { id: uid('sched'), time: '', name: '', details: '' };
}

export function emptyForm() {
  return {
    id: uid('bkg'),
    eventName: '', clientId: '', eventDate: '', eventType: '',
    brideName: '', groomName: '',
    guestCount: '',
    venue: emptyVenue(),
    schedule: [emptyScheduleItem()],
    depositAmount: '', depositDueDate: '', depositPaid: false, depositType: 'fixed', depositPercent: '',
    bookingStatus: '', priority: '', nextFollowUpDate: '',
    contractSignedDate: '', referralSource: '', notes: '', activityLog: [],
    proposal: null,
  };
}
