import { useCallback, useState } from "react";

export function useDirtyState() {
  const [isDirty, setDirty] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  return { isDirty, markDirty, clearDirty };
}
