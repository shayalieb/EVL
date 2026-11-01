// Maps errors that are caused by what the caller sent to the right 4xx. Anything
// not recognised here stays a 500 and keeps being treated as a server fault.
const INVALID_VALUE_CODES = new Set(['P2000', 'P2005', 'P2006', 'P2007', 'P2008', 'P2009', 'P2011', 'P2012', 'P2013', 'P2020']);
// Postgres messages for values that can never be stored (a NUL byte, text that is not UTF-8, out of range numbers).
const UNSTORABLE_VALUE = /invalid byte sequence|0x00|invalid input syntax|out of range|value too long|cannot be cast|incorrect .* value/i;

// "x.trim is not a function" means a string was expected and an object, array or number arrived:
// the caller sent the wrong type. The same method called on a null/undefined value the caller
// sent is the same mistake. Any other TypeError is still treated as a bug in our code.
const STRING_METHODS = 'trim|trimStart|trimEnd|toLowerCase|toUpperCase|startsWith|endsWith|split|replace|replaceAll|match|normalize|localeCompare|padStart|padEnd|charAt|slice|substring';
const WRONG_TYPE = new RegExp(`\\.(${STRING_METHODS})(\\?\\.)? is not a function$|Cannot read properties of (null|undefined) \\(reading '(trim|toLowerCase|toUpperCase|startsWith|endsWith|split)'\\)`);

export function clientFaultResponse(err) {
  if (!err) return null;
  if (err instanceof TypeError && WRONG_TYPE.test(String(err.message))) return { status: 400, message: 'Invalid request.' };
  if (err instanceof URIError || (err.status === 400 && /decode/i.test(err.message || ''))) return { status: 400, message: 'Bad request.' };
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) return { status, message: 'Bad request.' };
  if (err.name === 'PrismaClientValidationError') return { status: 400, message: 'Invalid request.' };
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') return { status: 409, message: 'That value is already in use.' };
    if (err.code === 'P2025') return { status: 404, message: 'Not found.' };
    if (INVALID_VALUE_CODES.has(err.code)) return { status: 400, message: 'Invalid request.' };
    if (err.code === 'P2010' && UNSTORABLE_VALUE.test(String(err.message))) return { status: 400, message: 'Invalid request.' };
  }
  if ((err.name === 'PrismaClientUnknownRequestError' || err.name === 'PrismaClientKnownRequestError') && UNSTORABLE_VALUE.test(String(err.message))) return { status: 400, message: 'Invalid request.' };
  return null;
}
