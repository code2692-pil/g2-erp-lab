export interface DirtyNavigationSource {
  id: string;
  label: string;
  dirty: boolean;
  saving: boolean;
}

export interface NavigationIntent {
  id: string;
  targetLabel: string;
  execute: () => void;
}

export type NavigationDecision = "allow" | "confirm" | "saving" | "duplicate";

export interface DirtyNavigationSnapshot {
  isDirty: boolean;
  isSaving: boolean;
  labels: string[];
  sourceCount: number;
}

export class DirtyNavigationCoordinator {
  private readonly sources = new Map<string, DirtyNavigationSource>();
  private pending: NavigationIntent | null = null;
  private savingNoticeOpen = false;

  upsert(source: DirtyNavigationSource) {
    this.sources.set(source.id, source);
  }

  remove(id: string) {
    this.sources.delete(id);
  }

  clearAll() {
    this.sources.clear();
  }

  snapshot(): DirtyNavigationSnapshot {
    const protectedSources = [...this.sources.values()].filter((source) => source.dirty || source.saving);
    return {
      isDirty: protectedSources.some((source) => source.dirty),
      isSaving: protectedSources.some((source) => source.saving),
      labels: [...new Set(protectedSources.map((source) => source.label))],
      sourceCount: protectedSources.length
    };
  }

  begin(intent: NavigationIntent): NavigationDecision {
    if (this.pending || this.savingNoticeOpen) return "duplicate";
    const snapshot = this.snapshot();
    if (snapshot.isSaving) {
      this.savingNoticeOpen = true;
      return "saving";
    }
    if (snapshot.isDirty) {
      this.pending = intent;
      return "confirm";
    }
    return "allow";
  }

  cancelPending() {
    this.pending = null;
  }

  closeSavingNotice() {
    this.savingNoticeOpen = false;
  }

  confirmPending(): NavigationIntent | null {
    const intent = this.pending;
    this.pending = null;
    if (!intent) return null;
    this.clearAll();
    return intent;
  }

  hasPendingIntent() {
    return this.pending !== null;
  }

  hasSavingNotice() {
    return this.savingNoticeOpen;
  }
}
