# AI maintenance architecture

```text
Repository state
  -> signal collector
  -> candidate generator
  -> boundary evaluator (ANALYZE / PREDEVELOP)
  -> quality-gate runner
  -> JSON, Markdown, and decision-queue artifacts
  -> consultant and developer final decision
```

ANALYZE records warnings even on dirty, main, FREEZE, or protected-path states. PREDEVELOP rejects those same states before any implementation branch could be considered. The report is stored under `.artifacts/maintenance/`, which is ignored by Git.

User-facing ERP behavior is not changed. Existing terms such as 거래처 찾기 창, 품목 찾기 창, 창고 찾기 창, and 찾기 창 팝업 remain product-language concerns rather than maintenance-system output.
