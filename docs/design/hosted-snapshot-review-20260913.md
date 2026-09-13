# Hosted screenshot baseline review, September 13

The README PR also restores an executable full gate: the repository has no registered self-hosted runner for its former `vibeflare-gate` label. The gate now runs on pinned Ubuntu 24.04 with the repository-locked Chromium, and still executes the build, deployment-config validation, dependency audit, unit suite and every browser test.

Run 34762652704 at source `185d0f0b374722f29dd1871e3407d6a0385b5189` passed 75 browser journeys and failed 28 matrix screenshot comparisons. The screenshot cases reached their visual assertion after their DOM, network and role checks. The previous images predate the product identity changes already merged on main in `4af727d`.

All 28 difference images were visually reviewed across desktop/mobile, anonymous/owner/user, and login, setup, chat, files, history, keys, analytics and settings. The differences are the approved independent VibeFlare identity (V mark, wordmark, header/login/footer wording), plus text rasterization on the hosted renderer. Detailed before/after checks of desktop chat, mobile login and mobile settings confirmed the same page geometry, controls, theme artwork and fixture state. No removed controls, missing content or broken layout were accepted.

The updated baselines are the actual images from that exact run, not newly rendered application changes. The JSON companion binds every previous and replacement PNG to SHA-256 and identifies the immutable workflow artifact. No screenshot tolerance, mask, assertion, route, role or test count was loosened. A fresh full gate must compare against these baselines and pass before merge.

These are isolated browser fixtures, not production inference or installation evidence. The README screenshots retain their separate capture manifest.
