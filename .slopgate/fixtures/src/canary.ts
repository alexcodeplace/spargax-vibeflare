// slopgate canary — intentional violations for self-test
// This file must never be imported by production code.

// raw-hex-color canary
const BADGE_COLOR = "#ff0044";

// as-any-cast canary
const x = {} as any;

// ts-suppress canary
// @ts-expect-error
const y: number = "bad";

// no-stubs canary
// placeholder for now
