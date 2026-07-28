# Quality gates

The Gate 10 runner has three fixed profiles. It accepts only these profiles and does not concatenate user input into a shell command.

| Profile | Contents | Intended use |
| --- | --- | --- |
| `quick` | diff check, typecheck, build, .NET build, one Mock smoke, one InMemory smoke | local checkpoint before review |
| `full` | quick plus full Mock and InMemory suites | planned regression window |
| `nightly` | full plus race, validation, dirty guard, Grid keyboard, and Ctrl+V contracts | unattended CI schedule |

Every command records start and finish time, duration, exit code, and a redacted stdout/stderr summary in `.artifacts/maintenance/quality-gate-result.json`.

The runner does not increase timeout or retry values, does not run SQL Server, and stops at the first failed command. A failed gate is evidence for a report, not permission to weaken a test.
