// Full-width primary submit button with a loading spinner — the same markup
// was duplicated verbatim across Auth, Reset Password, Invoice Pay, and
// Contract Sign.
export default function SubmitButton({ loading = false, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2"
    >
      {loading && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
      {children}
    </button>
  );
}
