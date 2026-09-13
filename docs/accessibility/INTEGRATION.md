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
