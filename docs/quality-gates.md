# Quality gates

The Gate 10 runner has three fixed profiles. It accepts only these profiles and does not concatenate user input into a shell command.

| Profile | Contents | Intended use |
| --- | --- | --- |
| `quick` | diff check, typecheck, build, .NET build, one Mock smoke, one InMemory smoke | local checkpoint before review |
| `full` | quick plus full Mock and InMemory suites | planned regression window |
| `nightly` | full plus race, validation, dirty guard, Grid keyboard, and Ctrl+V contracts | unattended CI schedule |

Every command records start and finish time, duration, exit code, and a redacted stdout/stderr summary in `.artifacts/maintenance/quality-gate-result.json`.

The runner does not increase timeout or retry values, does not run SQL Server, and stops at the first failed command. A failed gate is evidence for a report, not permission to weaken a test.

## RC2 preflight

`pnpm run qa:rc2:preflight` is the release-candidate checkpoint. It requires a clean working tree and runs, in order: Git whitespace and package metadata checks, TypeScript typecheck, production build, .NET solution build, the Grid and AI unit tests, the SQL connection-policy test, and one existing local SQL worker request. Its internal static commands use the already-installed project Node executables rather than downloading or changing packages.

The SQL verification is delegated to the installed worker; the preflight does not duplicate its TCP/TLS probe, marker checks, runner/API smoke, or SQL integration tests. A process lock in the ignored `.local-runtime/rc2-preflight` directory prevents overlapping preflight runs. Use `-AllowDirty` only while validating uncommitted development work.

The command stops on the first failing step, prints duration and exit status for every completed step, and ends with exactly `RC2 PREFLIGHT: PASS` or `RC2 PREFLIGHT: FAIL`.

## RC2 full regression

`pnpm run qa:rc2:full` is the release-delivery evidence command. It requires a clean tree, records an individual log and a JSON summary under the ignored `.local-runtime/rc2-full-regression/` directory, and stops at the first failure. It covers PowerShell parsing and safe validation modes, package metadata, static SQL safety checks, TypeScript, production build and bundle budget, Node unit/QA suites, the non-SQL .NET test set, the configured Mock/InMemory PC/mobile/PDA Playwright groups, and one installed SQL worker request.

The SQL worker remains the only step that touches the local SQL Server. It performs the encrypted TCP/TLS probe, marker checks, SQL runner/API smoke, integration tests, and post-test residue verification once. The full command requires its result to pass, verifies that 5173 and 5080 are free afterwards, and ends with exactly `RC2 FULL REGRESSION: PASS` or `RC2 FULL REGRESSION: FAIL`. It never installs, restarts, or removes the worker.
