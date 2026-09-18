The world renderer, world presets, sprite reader, sounds, UI, and reveal were
originally extracted from an earlier rarefriends-web implementation. Movement
and image loading adapt its former fishing world implementation without the
fishing game rules. This records historical provenance; the current production
web app does not contain or consume FriendSDK. See assets/provenance.json
and assets/sound-provenance.json for the original artwork and audio sources.

React and viem retain their own licenses in their installed packages. The
standalone fishing build bundles its dependencies and retains their generated
license notices. A distribution license for Rare Friends source and artwork
has not yet been selected.

The standalone contracts reuse the earlier unpublished ChanceGame accounting,
with canonical-wallet purchases and Dice Protocol integration. No deployed
Rare Friends protocol implementation is included. OpenZeppelin (MIT) and
forge-std (MIT/Apache-2.0) retain their notices in `contracts/lib`; the vendored
source hashes are recorded in `contracts/lib/provenance.json`.
