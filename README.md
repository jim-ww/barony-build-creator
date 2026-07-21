# Barony Build Creator

Interactive Barony build creator — pick a race and class to see combined buffs, debuffs, stats, and starting equipment. Shareable via URL, saved builds persist locally, community builds via Nostr.

## Data

Race and class data lives in `data/barony-data.json`, sourced from [barony.wiki.gg](https://barony.wiki.gg). PRs to fix inaccuracies are welcome.

## Community builds

Publishing a build broadcasts it to public [Nostr](https://nostr.com) relays under a local, anonymous keypair generated in your browser — there's no account, no moderation, and no guarantee a relay keeps your data forever.

## Attribution & licensing

This project's own code is licensed under AGPLv3 (see `LICENSE`).

Race/class text (buffs, debuffs, stats, starting equipment) is adapted from [barony.wiki.gg](https://barony.wiki.gg), whose content is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0).

This project does not claim ownership over the race/class icon images (`assets/icons/`) — those rights belong to Barony's game developers.
