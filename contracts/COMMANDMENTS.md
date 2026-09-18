# The Ten Commandments for Touching RareFriendsGenesis

You are updating `src/RareFriendsGenesis.sol` to address audit findings. Read all ten before opening the file. When a finding and a commandment conflict, the commandment wins and the finding is rejected with a written reason.

## I. Thou shalt delete before thou addest

The standard for every line is "is this line necessary," not "did I preserve old behavior." An audit finding is not a license to add code. Before writing a fix, ask whether removing something resolves it instead.

## II. Thou shalt name the attacker before adding a check

No defensive code without a concrete on-chain attacker and a concrete loss. A user who hurts only themself is not a threat model. Sending a Friend into its own token-bound account, sending to a wrong address, or calling a function with bad arguments is the user's problem, and they deserve to get rekt. The former ownership-cycle check in `_update` was removed for exactly this reason. Do not reintroduce it or anything shaped like it.

## III. Thou shalt not add mutable state

Constants over immutables, immutables over storage. `MAX_SUPPLY` is a constant, never a parameter. Storage today is `totalMinted`, `renderer`, and `activationManager`. Adding a fourth requires the finding to be unfixable any other way, and you must say so in your report.

## IV. Thou shalt not widen the owner

Owner powers are exactly `setRenderer`, `setActivationManager`, `setRoyalty`, and SeaDrop sale configuration. No pause, no emergency withdraw, no upgradeability, no timelock, no roles, no rescue functions. A finding that says "owner should be able to" is rejected.

## V. Thou shalt not build for the future

No hooks, epochs, plugins, config structs, feature flags, or "extensibility." No interface with a single implementer unless it exists only to type an external call. If a feature does not exist today, no code prepares for it.

## VI. Thou shalt keep Genesis dumb

Genesis holds no artwork, DNA, metadata format, or sale logic. The renderer returns the entire `tokenURI`. SeaDrop lives in `src/integrations/` and is transport only. Activation state lives in the manager: Genesis calls `clearActivation` inside `try/catch` after every true ownership transfer and remembers nothing else. ERC-6551 stays as is: canonical registry, pinned implementation, salt zero.

## VII. Thou shalt write in the house style

Custom errors, never `require` strings. `UPPER_SNAKE` for constants, leading underscore for internal and private. No wrapper that only calls another function. No getter that duplicates public state. No event for a value that cannot change. Solidity `^0.8.36`, OpenZeppelin imported from `lib/`, formatted like the surrounding code. New code must look like it was written by the same person on the same day.

## VIII. Thou shalt answer each finding with a verdict

For every finding, record one of: **Fixed**, **Rejected** with the threat-model reason, or **Already handled** with the line that handles it. Touch only lines a finding names. Do not fold a style rewrite, a rename, or a "while I was here" into an audit fix.

## IX. Thou shalt not invent

No values the owner has not given: no symbols, addresses, royalty bps, URIs, or salts. Do not compile, test, or run analyzers unless the request allows it. When you did not run something, say so plainly instead of implying it passed.

## X. Thou shalt report faithfully

Say what changed, what was rejected and why, and what was not verified. No "hardened," "improved safety," or other audit-speak. If a fix cannot be made inside these commandments, say that and stop. Do not bend a commandment to close a finding.
