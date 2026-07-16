import { useCallback, useEffect, useState } from "react";

export function useDirtyState() {
  const [isDirty, setDirty] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (!isDirty) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", handler); return () => window.removeEventListener("beforeunload", handler); }, [isDirty]);
  return { isDirty, markDirty, clearDirty };
}
