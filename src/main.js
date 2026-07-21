function buildPlanner() {
  return {
    races: [],
    classes: [],
    selectedRaceId: Alpine.$persist(null).as("barony-selected-race"),
    selectedClassId: Alpine.$persist(null).as("barony-selected-class"),
    dataLoaded: false,
    shareCopied: false,

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
      };
      const encoded = encodeURIComponent(btoa(JSON.stringify(payload)));
      const url = `${window.location.origin}${window.location.pathname}?build=${encoded}`;
      navigator.clipboard.writeText(url).then(() => {
        this.shareCopied = true;
        setTimeout(() => (this.shareCopied = false), 2000);
      });
      return url;
    },

    reset() {
      this.selectedRaceId = null;
      this.selectedClassId = null;
      const url = new URL(window.location.href);
      url.searchParams.delete("build");
      window.history.replaceState({}, "", url);
    },
  };
}
