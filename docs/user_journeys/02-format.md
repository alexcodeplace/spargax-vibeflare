# Journey Format

Every canonical journey contains:

- an exact actor and trigger;
- one exact request/response contract per branch;
- visible result;
- durable state result;
- a fresh read proving persistence;
- forbidden effects;
- source:line evidence for every behavioral claim.

A test derived from a journey must prove the durable/fresh-read outcome where the journey defines one. Browser appearance alone is insufficient.
