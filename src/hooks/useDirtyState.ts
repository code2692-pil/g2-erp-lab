import { useCallback, useEffect, useId, useState } from "react";
import { useDirtyNavigation } from "../navigation/DirtyNavigationProvider";

interface DirtyStateOptions {
  label?: string;
  saving?: boolean;
}

export function useDirtyState(options: DirtyStateOptions = {}) {
  const [isDirty, setDirty] = useState(false);
  const generatedId = useId();
  const { registerSource } = useDirtyNavigation();
  const label = options.label ?? "현재 화면";
  const saving = options.saving ?? false;

  useEffect(() => registerSource({ id: generatedId, label, dirty: isDirty, saving }), [generatedId, isDirty, label, registerSource, saving]);
  const markDirty = useCallback(() => setDirty(true), []);
  const clearDirty = useCallback(() => setDirty(false), []);
  return { isDirty, markDirty, clearDirty };
}
