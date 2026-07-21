function buildPlanner() {
  return {
    races: [],
    classes: [],
    selectedRaceId: Alpine.$persist(null).as("barony-selected-race"),
    selectedClassId: Alpine.$persist(null).as("barony-selected-class"),
    buildName: Alpine.$persist("").as("barony-build-name"),
    buildDescription: Alpine.$persist("").as("barony-build-description"),
    savedBuilds: Alpine.$persist([]).as("barony-saved-builds"),
    savedBuildsSearch: "",
    dataLoaded: false,
    shareCopied: false,

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
        } catch (e) {
          console.warn("Failed to parse build from URL", e);
        }
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

    get filteredSavedBuilds() {
      if (!this.savedBuildsSearch) return this.savedBuilds;
      return this.savedBuilds.filter((b) =>
        this.fuzzyMatch(
          this.savedBuildsSearch,
          `${b.name} ${this.raceName(b.race)} ${this.className(b.class)}`,
        ),
      );
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
        },
      ];
    },

    loadBuild(build) {
      this.selectedRaceId = build.race;
      this.selectedClassId = build.class;
      this.buildName = build.name;
      this.buildDescription = build.description;
    },

    deleteBuild(id) {
      this.savedBuilds = this.savedBuilds.filter((b) => b.id !== id);
    },

    reset() {
      this.selectedRaceId = null;
      this.selectedClassId = null;
      this.buildName = "";
      this.buildDescription = "";
      const url = new URL(window.location.href);
      url.searchParams.delete("build");
      window.history.replaceState({}, "", url);
    },
  };
}
