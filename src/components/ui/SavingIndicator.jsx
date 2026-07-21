import { createContext, useCallback, useContext, useRef, useState } from 'react';

const SavingIndicatorContext = createContext(null);

// A single, non-stacking "Saving…" pill — distinct from Toast (which queues
// multiple messages) because auto-save fires on every field blur across the
// app; queuing those would pile up toasts instead of showing one quiet cue.
// Re-triggering just resets the 3s timer rather than adding another one.
export function SavingIndicatorProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const notifySaving = useCallback(() => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3000);
  }, []);

  return (
    <SavingIndicatorContext.Provider value={notifySaving}>
      {children}
      <div
        className={`fixed bottom-4 left-4 z-50 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        aria-live="polite"
      >
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white bg-slate-800">
          <span className="w-3 h-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          Saving…
        </div>
      </div>
    </SavingIndicatorContext.Provider>
  );
}

export function useSavingIndicator() {
  const ctx = useContext(SavingIndicatorContext);
  if (!ctx) throw new Error('useSavingIndicator must be used within SavingIndicatorProvider');
  return ctx;
}
