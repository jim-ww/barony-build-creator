function buildPlanner() {
  return {
    races: [],
    classes: [],
    selectedRaceId: Alpine.$persist(null).as("barony-selected-race"),
    selectedClassId: Alpine.$persist(null).as("barony-selected-class"),
    buildName: Alpine.$persist("").as("barony-build-name"),
    buildDescription: Alpine.$persist("").as("barony-build-description"),
    buildTags: Alpine.$persist("").as("barony-build-tags"),
    savedBuilds: Alpine.$persist([]).as("barony-saved-builds"),
    savedBuildsSearch: "",
    activeTagFilter: null,
    dataLoaded: false,
    shareCopied: false,

    publishedBuildsMap: {},
    deletedAddresses: {},
    publishedBuilds: [],
    publishing: false,
    communitySearch: "",
    activeCommunityTagFilter: null,
    nostrSecretKeyHex: Alpine.$persist(null).as("barony-nostr-sk"),
    nostrPubkey: null,
    NOSTR_BUILD_KIND: 30078,
    NOSTR_APP_LABEL: "barony-build-creator",
    // Junk published to public relays during development testing, before deletion-on-cleanup
    // was verified working. Their signing keys are gone, so NIP-09 deletion isn't possible;
    // hide them client-side instead so the community list stays clean for real users.
    NOSTR_NAME_BLOCKLIST: ["Test Publish Build", "Dedup Test Build"],

    raceTabs: ["All", "Melee", "Ranged", "Magic", "Universal"],
    classTabs: ["All", "Melee", "Ranged", "Magic", "Universal", "Specialized"],
    activeRaceTab: "All",
    activeClassTab: "All",

    get filteredRaces() {
      if (this.activeRaceTab === "All") return this.races;
      return this.races.filter((r) => (r.categories || []).includes(this.activeRaceTab));
    },

    get filteredClasses() {
      if (this.activeClassTab === "All") return this.classes;
      return this.classes.filter((c) => (c.categories || []).includes(this.activeClassTab));
    },

    async init() {
      const res = await fetch("data/barony-data.json");
      const data = await res.json();
      this.races = data.races;
      this.classes = data.classes;
      this.dataLoaded = true;

      // Restore from URL if present (takes priority over persisted state)
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("build");
      if (encoded) {
        try {
          const decoded = JSON.parse(atob(decodeURIComponent(encoded)));
          if (decoded.race) this.selectedRaceId = decoded.race;
          if (decoded.class) this.selectedClassId = decoded.class;
          if (decoded.name) this.buildName = decoded.name;
          if (decoded.description) this.buildDescription = decoded.description;
          if (decoded.tags) this.buildTags = decoded.tags;
        } catch (e) {
          console.warn("Failed to parse build from URL", e);
        }
      }

      this.initNostr();
    },

    async initNostr() {
      const { SimplePool, generateSecretKey, getPublicKey, finalizeEvent } = await import(
        "https://esm.sh/nostr-tools@2.7.2"
      );
      if (!this.nostrSecretKeyHex) {
        this.nostrSecretKeyHex = this.bytesToHex(generateSecretKey());
      }
      const skBytes = this.hexToBytes(this.nostrSecretKeyHex);
      this.nostrPubkey = getPublicKey(skBytes);
      this._nostrSkBytes = skBytes;
      this._finalizeEvent = finalizeEvent;
      this.nostrPool = new SimplePool();
      this.nostrRelays = [
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.nostr.band",
        "wss://relay.primal.net",
        "wss://offchain.pub",
      ];

      this.nostrPool.subscribeMany(
        this.nostrRelays,
        [
          { kinds: [this.NOSTR_BUILD_KIND], "#L": [this.NOSTR_APP_LABEL], limit: 500 },
          { kinds: [5], "#L": [this.NOSTR_APP_LABEL], limit: 500 },
        ],
        {
          onevent: (event) => this.handleNostrEvent(event),
        },
      );
    },

    bytesToHex(bytes) {
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    },

    hexToBytes(hex) {
      const arr = new Uint8Array(hex.length / 2);
      for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
      return arr;
    },

    handleNostrEvent(event) {
      if (event.kind === this.NOSTR_BUILD_KIND) {
        const dTag = event.tags.find((t) => t[0] === "d")?.[1];
        if (!dTag) return;
        let data;
        try {
          data = JSON.parse(event.content);
        } catch (e) {
          return;
        }
        if (this.NOSTR_NAME_BLOCKLIST.includes(data.name)) return;
        const address = `${this.NOSTR_BUILD_KIND}:${event.pubkey}:${dTag}`;
        if (this.deletedAddresses[address]) return;
        const build = {
          id: `${event.pubkey}:${dTag}`,
          dTag,
          pubkey: event.pubkey,
          name: data.name,
          description: data.description,
          race: data.race,
          class: data.class,
          tags: event.tags.filter((t) => t[0] === "t").map((t) => t[1]),
          createdAt: event.created_at,
        };
        const existing = this.publishedBuildsMap[build.id];
        if (!existing || existing.createdAt <= build.createdAt) {
          this.publishedBuildsMap = { ...this.publishedBuildsMap, [build.id]: build };
          this.publishedBuilds = Object.values(this.publishedBuildsMap);
        }
      } else if (event.kind === 5) {
        const addresses = event.tags.filter((t) => t[0] === "a").map((t) => t[1]);
        this.deletedAddresses = {
          ...this.deletedAddresses,
          ...Object.fromEntries(addresses.map((a) => [a, true])),
        };
        const map = { ...this.publishedBuildsMap };
        for (const id of Object.keys(map)) {
          if (addresses.includes(`${this.NOSTR_BUILD_KIND}:${map[id].pubkey}:${map[id].dTag}`)) delete map[id];
        }
        this.publishedBuildsMap = map;
        this.publishedBuilds = Object.values(map);
      }
    },

    get selectedRace() {
      return this.races.find((r) => r.id === this.selectedRaceId) || null;
    },

    get selectedClass() {
      return this.classes.find((c) => c.id === this.selectedClassId) || null;
    },

    selectRace(id) {
      this.selectedRaceId = this.selectedRaceId === id ? null : id;
    },

    selectClass(id) {
      this.selectedClassId = this.selectedClassId === id ? null : id;
    },

    resolveEntries(entries) {
      return entries
        .filter((entry) => {
          if (typeof entry === "string") return true;
          if (entry.onlyWithClass) return entry.onlyWithClass === this.selectedClassId;
          if (entry.onlyWithRace) return entry.onlyWithRace === this.selectedRaceId;
          return true;
        })
        .map((entry) => (typeof entry === "string" ? entry : entry.text));
    },

    get combinedBuffs() {
      const race = this.selectedRace;
      const cls = this.selectedClass;
      return this.resolveEntries([...(race?.buffs || []), ...(cls?.buffs || [])]);
    },

    get combinedDebuffs() {
      const race = this.selectedRace;
      const cls = this.selectedClass;
      return this.resolveEntries([...(race?.debuffs || []), ...(cls?.debuffs || [])]);
    },

    get finalStats() {
      const base = this.selectedClass?.startingStats || {
        STR: 0,
        DEX: 0,
        CON: 0,
        INT: 0,
        PER: 0,
        CHA: 0,
      };
      const mod = this.selectedRace?.statModifiers || {
        STR: 0,
        DEX: 0,
        CON: 0,
        INT: 0,
        PER: 0,
        CHA: 0,
      };
      const result = {};
      for (const key of Object.keys(base)) {
        result[key] = base[key] + (mod[key] || 0);
      }
      return result;
    },

    shareUrl() {
      const payload = {
        race: this.selectedRaceId,
        class: this.selectedClassId,
        name: this.buildName || undefined,
        description: this.buildDescription || undefined,
        tags: this.buildTags || undefined,
      };
      const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
      const url = `${window.location.origin}${window.location.pathname}?build=${encoded}`;
      navigator.clipboard.writeText(url).then(() => {
        this.shareCopied = true;
        setTimeout(() => (this.shareCopied = false), 2000);
      });
      return url;
    },

    fuzzyMatch(query, text) {
      if (!query) return true;
      const q = query.toLowerCase();
      const t = (text || "").toLowerCase();
      let qi = 0;
      for (let ti = 0; ti < t.length && qi < q.length; ti++) {
        if (t[ti] === q[qi]) qi++;
      }
      return qi === q.length;
    },

    parseTags(str) {
      return [...new Set((str || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
    },

    get filteredSavedBuilds() {
      return this.savedBuilds
        .filter((b) => !this.activeTagFilter || (b.tags || []).includes(this.activeTagFilter))
        .filter((b) =>
          this.fuzzyMatch(
            this.savedBuildsSearch,
            `${b.name} ${this.raceName(b.race)} ${this.className(b.class)} ${(b.tags || []).join(" ")}`,
          ),
        );
    },

    get allSavedTags() {
      return [...new Set(this.savedBuilds.flatMap((b) => b.tags || []))].sort();
    },

    toggleTagFilter(tag) {
      this.activeTagFilter = this.activeTagFilter === tag ? null : tag;
    },

    get filteredPublishedBuilds() {
      return this.publishedBuilds
        .filter((b) => !this.activeCommunityTagFilter || (b.tags || []).includes(this.activeCommunityTagFilter))
        .filter((b) =>
          this.fuzzyMatch(
            this.communitySearch,
            `${b.name} ${this.raceName(b.race)} ${this.className(b.class)} ${(b.tags || []).join(" ")}`,
          ),
        );
    },

    get allPublishedTags() {
      return [...new Set(this.publishedBuilds.flatMap((b) => b.tags || []))].sort();
    },

    toggleCommunityTagFilter(tag) {
      this.activeCommunityTagFilter = this.activeCommunityTagFilter === tag ? null : tag;
    },

    raceName(id) {
      return this.races.find((r) => r.id === id)?.name || "—";
    },

    className(id) {
      return this.classes.find((c) => c.id === id)?.name || "—";
    },

    saveBuild() {
      if (!this.selectedRaceId && !this.selectedClassId) return;
      this.savedBuilds = [
        ...this.savedBuilds,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: this.buildName || `${this.raceName(this.selectedRaceId)} ${this.className(this.selectedClassId)}`.trim(),
          description: this.buildDescription,
          race: this.selectedRaceId,
          class: this.selectedClassId,
          tags: this.parseTags(this.buildTags),
        },
      ];
    },

    loadBuild(build) {
      this.selectedRaceId = build.race;
      this.selectedClassId = build.class;
      this.buildName = build.name;
      this.buildDescription = build.description;
      this.buildTags = (build.tags || []).join(", ");
    },

    deleteBuild(id) {
      this.savedBuilds = this.savedBuilds.filter((b) => b.id !== id);
    },

    publishBuild() {
      if (!this.nostrPool || (!this.selectedRaceId && !this.selectedClassId)) return;
      this.publishing = true;
      const dTag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const content = JSON.stringify({
        name: this.buildName || `${this.raceName(this.selectedRaceId)} ${this.className(this.selectedClassId)}`.trim(),
        description: this.buildDescription,
        race: this.selectedRaceId,
        class: this.selectedClassId,
      });
      const unsigned = {
        kind: this.NOSTR_BUILD_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["d", dTag],
          ["L", this.NOSTR_APP_LABEL],
          ["l", this.NOSTR_APP_LABEL],
          ...this.parseTags(this.buildTags).map((t) => ["t", t]),
        ],
        content,
        pubkey: this.nostrPubkey,
      };
      const signed = this._finalizeEvent(unsigned, this._nostrSkBytes);
      Promise.allSettled(this.nostrPool.publish(this.nostrRelays, signed)).then(() => {
        this.publishing = false;
      });
    },

    isMine(build) {
      return build.pubkey === this.nostrPubkey;
    },

    deletePublishedBuild(build) {
      if (!this.nostrPool || !this.isMine(build)) return;
      const address = `${this.NOSTR_BUILD_KIND}:${build.pubkey}:${build.dTag}`;
      const unsigned = {
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["a", address],
          ["L", this.NOSTR_APP_LABEL],
        ],
        content: "deleted build",
        pubkey: this.nostrPubkey,
      };
      const signed = this._finalizeEvent(unsigned, this._nostrSkBytes);
      this.nostrPool.publish(this.nostrRelays, signed);
      const map = { ...this.publishedBuildsMap };
      delete map[build.id];
      this.publishedBuildsMap = map;
      this.publishedBuilds = Object.values(map);
    },

    reset() {
      this.selectedRaceId = null;
      this.selectedClassId = null;
      this.buildName = "";
      this.buildDescription = "";
      this.buildTags = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("build");
      window.history.replaceState({}, "", url);
    },
  };
}
