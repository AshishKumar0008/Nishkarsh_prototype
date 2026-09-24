<!-- template: commitment-card · version 0.1-draft -->
# Commitment Card (two-sided)

Generated automatically when the pilot agreement is drafted and embedded in clause 6 of the agreement.
**Source of truth:** `buildCommitmentCard()` in `packages/shared/src/agreement.ts` (typed and unit-tested) —
edit the wording there, then update this page to match.

| Party | Commitment | Due |
|---|---|---|
| Department | Give the Startup access to the field site and name a field-site supervisor | Pilot start |
| Department | Designate the independent validator for this pilot | Pilot start + 14 days |
| Department | Release tranche *N* within 15 days of both sign-offs on milestone *N* (one row per milestone) | Milestone *N* due + 15 days |
| Startup | Deliver milestone *N* (one row per milestone) | Milestone *N* due |
| Startup | Respond to field-site issues within 48 hours throughout the pilot | Pilot end |
| Startup | Hand over Pilot Data in an open format (clause 7) | Pilot end + 14 days |

Department rows come first on purpose: department non-performance (late payment, no site access) is the more
common real-world failure and is invisible in most procurement designs.
