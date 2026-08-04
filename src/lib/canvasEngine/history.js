import { useCallback, useMemo, useState } from 'react';

// Session-only undo/redo for a canvas scene (src/lib/canvasEngine/sceneModel.js).
// Deliberately NOT persisted server-side — reloading the editor starts a
// fresh history, only the current `scene` is autosaved. A full snapshot per
// step (not an operation/command log) since scenes stay small (at most a
// few hundred elements) and whole-snapshot undo is far less bug-prone than
// inverting arbitrary mutations.
const HISTORY_CAP = 100;

export function useUndoRedo(initialScene) {
  const [state, setState] = useState(() => ({ history: [initialScene], index: 0 }));

  // mutate(scene) => nextScene — e.g. (s) => addElement(s, {...}).
  const apply = useCallback((mutate) => {
    setState(({ history, index }) => {
      const nextScene = mutate(history[index]);
      const truncated = history.slice(0, index + 1);
      let nextHistory = [...truncated, nextScene];
      let nextIndex = nextHistory.length - 1;
      if (nextHistory.length > HISTORY_CAP) {
        nextHistory = nextHistory.slice(nextHistory.length - HISTORY_CAP);
        nextIndex = nextHistory.length - 1;
      }
      return { history: nextHistory, index: nextIndex };
    });
  }, []);

  const undo = useCallback(() => {
    setState(({ history, index }) => (index > 0 ? { history, index: index - 1 } : { history, index }));
  }, []);

  const redo = useCallback(() => {
    setState(({ history, index }) => (index < history.length - 1 ? { history, index: index + 1 } : { history, index }));
  }, []);

  // Replaces the current step in place without pushing a new history entry
  // — for scene-level settings (scale, grid spacing, paper size) that
  // shouldn't spam the undo stack the way placing/moving an element should.
  const replaceCurrent = useCallback((mutate) => {
    setState(({ history, index }) => {
      const nextHistory = [...history];
      nextHistory[index] = mutate(history[index]);
      return { history: nextHistory, index };
    });
  }, []);

  return useMemo(() => ({
    scene: state.history[state.index],
    apply,
    undo,
    redo,
    replaceCurrent,
    canUndo: state.index > 0,
    canRedo: state.index < state.history.length - 1,
  }), [state, apply, undo, redo, replaceCurrent]);
}
