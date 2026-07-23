# Controlled baseline

This directory defines the immutable functional reference used during the V48 Enterprise integration.

## Registered source

- Falcon V46.8.0 Enterprise Security Foundation
- Self-contained HTML reference
- Companion JavaScript reference
- Integrity hashes recorded in `BASELINE.json`

## Rules

- Do not modify the registered baseline in place.
- Do not refactor directly inside the baseline.
- New implementation work occurs in `src/app` and `src/core`.
- Behavioural comparisons must be made against this reference.
- Any baseline replacement requires an explicit product decision and a new integrity record.

## Import status

The baseline identity and integrity record are committed. The full historical source remains an external controlled input until its large-file transport into GitHub is completed without alteration.
