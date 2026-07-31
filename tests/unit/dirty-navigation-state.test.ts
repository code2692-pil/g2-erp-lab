import assert from "node:assert/strict";
import test from "node:test";
import { navigationDelta, readAppHistoryEntry, withAppHistoryEntry } from "../../src/navigation/appHistory.ts";
import { DirtyNavigationCoordinator } from "../../src/navigation/dirtyNavigationState.ts";

test("dirty navigation coordinator aggregates sources and preserves their labels", () => {
  const coordinator = new DirtyNavigationCoordinator();
  coordinator.upsert({ id: "sales", label: "수주 등록", dirty: true, saving: false });
  coordinator.upsert({ id: "purchase", label: "발주 등록", dirty: false, saving: true });

  assert.deepEqual(coordinator.snapshot(), {
    isDirty: true,
    isSaving: true,
    labels: ["수주 등록", "발주 등록"],
    sourceCount: 2
  });

  coordinator.remove("sales");
  assert.deepEqual(coordinator.snapshot(), {
    isDirty: false,
    isSaving: true,
    labels: ["발주 등록"],
    sourceCount: 1
  });
});

test("dirty navigation coordinator confirms one pending intent once and clears only after discard confirmation", () => {
  const coordinator = new DirtyNavigationCoordinator();
  const executed: string[] = [];
  coordinator.upsert({ id: "sales", label: "수주 등록", dirty: true, saving: false });

  assert.equal(coordinator.begin({ id: "purchase", targetLabel: "발주 등록", execute: () => executed.push("purchase") }), "confirm");
  assert.equal(coordinator.begin({ id: "work", targetLabel: "작업지시 등록", execute: () => executed.push("work") }), "duplicate");
  assert.equal(coordinator.hasPendingIntent(), true);
  assert.equal(coordinator.snapshot().isDirty, true);

  coordinator.cancelPending();
  assert.equal(coordinator.hasPendingIntent(), false);
  assert.equal(coordinator.snapshot().isDirty, true);

  assert.equal(coordinator.begin({ id: "purchase", targetLabel: "발주 등록", execute: () => executed.push("purchase") }), "confirm");
  const intent = coordinator.confirmPending();
  intent?.execute();

  assert.deepEqual(executed, ["purchase"]);
  assert.deepEqual(coordinator.snapshot(), { isDirty: false, isSaving: false, labels: [], sourceCount: 0 });
  assert.equal(coordinator.confirmPending(), null);
});

test("saving source blocks navigation without turning the in-flight operation into a discard action", () => {
  const coordinator = new DirtyNavigationCoordinator();
  coordinator.upsert({ id: "work", label: "작업지시 등록", dirty: true, saving: true });

  assert.equal(coordinator.begin({ id: "sales", targetLabel: "수주 등록", execute: () => undefined }), "saving");
  assert.equal(coordinator.begin({ id: "purchase", targetLabel: "발주 등록", execute: () => undefined }), "duplicate");
  assert.equal(coordinator.hasSavingNotice(), true);
  assert.equal(coordinator.snapshot().isDirty, true);

  coordinator.closeSavingNotice();
  coordinator.upsert({ id: "work", label: "작업지시 등록", dirty: true, saving: false });
  assert.equal(coordinator.begin({ id: "sales", targetLabel: "수주 등록", execute: () => undefined }), "confirm");
});

test("app history entries are namespaced, parsed defensively, and retain unrelated history state", () => {
  const entry = { version: 1 as const, id: "g2erp-entry", index: 7, page: "purchase" as const };
  const state = withAppHistoryEntry({ external: "keep" }, entry);

  assert.deepEqual(state, { external: "keep", g2ErpAppNavigation: entry });
  assert.deepEqual(readAppHistoryEntry<typeof entry.page>(state), entry);
  assert.equal(readAppHistoryEntry({ g2ErpAppNavigation: { version: 2, id: "bad", index: 1, page: "sales" } }), null);
  assert.equal(readAppHistoryEntry({ g2ErpAppNavigation: { version: 1, id: "bad", index: Number.NaN, page: "sales" } }), null);
  assert.equal(navigationDelta(entry, { ...entry, id: "g2erp-next", index: 3, page: "sales" }), -4);
});
