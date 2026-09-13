# VibeFlare (Astro with React islands) accessibility integration

Status: implementation and acceptance in progress. Engineering target: WCAG 2.2 AA; this is not a legal certificate.

## Shared contract

Consume the immutable `@platform-modules/ui-accessibility` package documented in PACKAGE-PROVENANCE.md. The canonical boundaries and tests live in platform-modules/mod, `docs/specs/2026-09-13-ui-accessibility-boundaries.md`. Do not copy the controller into this app or introduce a second widget. Import the package stylesheet after the brand styles, then only host-specific integration overrides.

One native modal and one labelled launcher per document; ordinary browser zoom, password managers and assistive technology remain available. Settings use the same `spargax.a11y.v1` key but stay origin-local, never cross-origin cookies or account tracking. The host owns locale, statement/report links, landmarks, focus on navigation, content alternatives, form validation and workflow accessibility.

## Host acceptance

The public statement is `/accessibility`. It remains reachable without opening the widget and without signing in. Test default pages as well as settings: keyboard-only navigation, dialog boundaries and return focus, labelled forms, headings/landmarks, 320 CSS-pixel reflow, 200% text with increased spacing, light/dark/high contrast, English/Hebrew/Spanish panel text, reduced motion and forced colors. Preserve existing navigation, media, billing and authentication functionality. Browser audits must not disable failing accessibility rules. Store violations and incomplete checks separately; a zero automated violation count is not proof of complete conformance.

## Operational acceptance still required

Before a legal conformance claim, the operator must confirm applicable Israeli service regulations/SI 5568, US ADA obligations and EU EAA scope with qualified advice; publish a monitored account-free support contact and any required coordinator details; and complete assistive-technology, content-alternative, media/document and third-party purchase-flow reviews. The existing public GitHub report form is a functioning interim reporting route but requires a GitHub account. Do not invent a coordinator, phone number, inbox or legal exemption.

## Regression gate

The app's existing Playwright suite includes accessibility tests. The shared package has its own built-consumer tests, so acceptance covers both the reusable implementation and this framework's lifecycle. Keep CI, package integrity and existing regression checks required before merging.

## Shared legal-readiness and manual acceptance procedure

The canonical cross-project checklist is `platform-modules/mod:docs/standards/accessibility-release-readiness.md`. It defines evidence requirements for complete journeys, screen readers, captions/documents, contrast/zoom and a monitored account-free reporting channel. The local statement deliberately describes the current evaluation status rather than claiming certification.

## Using the controls

Open the labelled Accessibility button fixed near the lower corner. Keyboard users can Tab to it and press Enter, move through native controls with Tab/Shift+Tab, and close it with Escape. Text, contrast, spacing, focus, reading and motion controls apply immediately. Choose Reset adjustments to clear only these preferences. The system reduced-motion preference remains respected. Settings stay on the current website origin; the same browser visiting another product has separate settings. The permanent footer statement link remains available without the panel.

## Analytics-specific remediation

The 320px/200%-text page audit found a clipped pagination action. The request-audit widget must wrap its status/navigation controls, expose real table headers and cells, retain complete endpoint/model text, and offer a named keyboard-focusable scroller for its inherently two-dimensional data. Preserve loading geometry and verify against the existing analytics layout-shift and durable-audit journeys.

### Chart loading stability

Keep the accessible chart-data disclosure mounted during loading, error, empty and populated states. Its summary and reserved chart frame must not move when the request or lazy chart import completes. Expanding it while loading exposes an honest loading state, not an empty-data claim. Verify the same native disclosure survives the transition and the existing analytics CLS threshold remains unchanged.
