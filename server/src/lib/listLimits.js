// Hard ceiling, not real pagination — no account is anywhere near this
// today, it just stops a single request from pulling an unbounded row count
// into memory (concurrent requests against a huge account can OOM the
// process). Shared by every list route so a new one gets it by default
// instead of needing to remember to add its own copy.
export const MAX_LIST_ROWS = 10000;
