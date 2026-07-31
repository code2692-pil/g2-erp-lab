import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "../components/common/feedback/ConfirmDialog";
import { DirtyNavigationCoordinator, type DirtyNavigationSnapshot, type DirtyNavigationSource, type NavigationIntent } from "./dirtyNavigationState";

interface DirtyNavigationContextValue {
  registerSource: (source: DirtyNavigationSource) => () => void;
  requestNavigation: (intent: NavigationIntent) => void;
  snapshot: DirtyNavigationSnapshot;
}

const cleanSnapshot: DirtyNavigationSnapshot = { isDirty: false, isSaving: false, labels: [], sourceCount: 0 };
const DirtyNavigationContext = createContext<DirtyNavigationContextValue | null>(null);

function discardDescription(snapshot: DirtyNavigationSnapshot) {
  if (snapshot.labels.length === 1) return `${snapshot.labels[0]} 화면의 입력 내용이 사라집니다.`;
  return "계속하면 현재 화면의 입력 내용이 사라집니다.";
}

export function DirtyNavigationProvider({ children }: { children: ReactNode }) {
  const coordinatorRef = useRef(new DirtyNavigationCoordinator());
  const [snapshot, setSnapshot] = useState<DirtyNavigationSnapshot>(cleanSnapshot);
  const [modal, setModal] = useState<"discard" | "saving" | null>(null);

  const refresh = useCallback(() => setSnapshot(coordinatorRef.current.snapshot()), []);

  const registerSource = useCallback((source: DirtyNavigationSource) => {
    coordinatorRef.current.upsert(source);
    refresh();
    return () => {
      coordinatorRef.current.remove(source.id);
      refresh();
    };
  }, [refresh]);

  const requestNavigation = useCallback((intent: NavigationIntent) => {
    const decision = coordinatorRef.current.begin(intent);
    if (decision === "allow") {
      intent.execute();
      return;
    }
    if (decision === "confirm") setModal("discard");
    if (decision === "saving") setModal("saving");
  }, []);

  const cancelDiscard = useCallback(() => {
    coordinatorRef.current.cancelPending();
    setModal(null);
  }, []);

  const confirmDiscard = useCallback(() => {
    const intent = coordinatorRef.current.confirmPending();
    setModal(null);
    refresh();
    intent?.execute();
  }, [refresh]);

  const closeSaving = useCallback(() => {
    coordinatorRef.current.closeSavingNotice();
    setModal(null);
  }, []);

  useEffect(() => {
    if (!snapshot.isDirty && !snapshot.isSaving) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [snapshot.isDirty, snapshot.isSaving]);

  const contextValue = useMemo(() => ({ registerSource, requestNavigation, snapshot }), [registerSource, requestNavigation, snapshot]);
  return <DirtyNavigationContext.Provider value={contextValue}>{children}
    <ConfirmDialog
      open={modal === "discard"}
      title="저장되지 않은 변경사항"
      message="저장하지 않은 변경사항이 있습니다."
      description={discardDescription(snapshot)}
      confirmLabel="변경사항 버리기"
      cancelLabel="계속 편집"
      danger
      onConfirm={confirmDiscard}
      onCancel={cancelDiscard}
    />
    <ConfirmDialog
      open={modal === "saving"}
      title="저장 처리 중"
      message="저장 처리가 끝난 후 이동할 수 있습니다."
      description="현재 입력과 저장 결과를 안전하게 유지하기 위해 화면 이동을 보류했습니다."
      confirmLabel="알겠습니다"
      showCancel={false}
      onConfirm={closeSaving}
      onCancel={closeSaving}
    />
  </DirtyNavigationContext.Provider>;
}

export function useDirtyNavigation() {
  const context = useContext(DirtyNavigationContext);
  if (!context) throw new Error("useDirtyNavigation must be used inside DirtyNavigationProvider.");
  return context;
}
