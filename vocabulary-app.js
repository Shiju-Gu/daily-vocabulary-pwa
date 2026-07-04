const storageKey = "word-recorder-items-v1";
const localMeaningEndpoint = "http://127.0.0.1:4197/api/meaning";
const localPronunciationEndpoint = "http://127.0.0.1:4197/api/pronunciation";
const localAudioEndpoint = "http://127.0.0.1:4197/api/audio";
const translationEndpoint = "https://api.mymemory.translated.net/get";
const dictionaryEndpoint = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const datamuseEndpoint = "https://api.datamuse.com/words";
const configuredApiBase = String(window.VOCABULARY_API_BASE || "").replace(/\/+$/, "");

const statusText = {
  new: "New",
  known: "Known",
  unknown: "Unknown",
};

const statusClass = {
  new: "status-new",
  known: "status-known",
  unknown: "status-missed",
};

const partOfSpeechText = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
};

const wordSpecificMeanings = {
  slug: ["蛞蝓", "文本字符串", "质量单位", "弹头或金属块"],
};

const sensePhraseRules = [
  { phrase: "蛞蝓", patterns: [/gastropod/i, /mollus[ck]/i, /shell-less/i, /land snail/i] },
  { phrase: "文本字符串", patterns: [/url/i, /web address/i, /readable identifier/i, /short label/i, /permalink/i, /text string/i, /identifier/i] },
  { phrase: "质量单位", patterns: [/unit of mass/i, /mass unit/i, /32\.174/i, /pound-force/i] },
  { phrase: "弹头或金属块", patterns: [/bullet/i, /projectile/i, /shot\b/i, /cartridge/i, /piece of metal/i, /lump of metal/i, /type metal/i, /printing/i] },
  { phrase: "意外发现", patterns: [/chance/i, /fortunate accident/i, /unexpected discovery/i, /surprisingly good/i] },
  { phrase: "大片或畅销作品", patterns: [/popular film/i, /movie/i, /commercial success/i, /best-selling/i, /blockbuster/i] },
  { phrase: "重磅炸弹", patterns: [/large bomb/i, /powerful bomb/i, /high-explosive/i] },
  { phrase: "专横的", patterns: [/domineering/i, /bossy/i, /overbearing/i, /tyrannical/i] },
  { phrase: "重新获得", patterns: [/regain/i, /recover/i, /get back/i, /obtain again/i] },
];

const state = {
  words: loadWords(),
  reviewFilters: ["new"],
  recordFilters: ["new"],
  mode: "order",
  currentId: null,
  autoTimer: null,
};

const el = {
  countNew: document.querySelector("#countNew"),
  countKnown: document.querySelector("#countKnown"),
  countMissed: document.querySelector("#countMissed"),
  countTotal: document.querySelector("#countTotal"),
  wordForm: document.querySelector("#wordForm"),
  wordInput: document.querySelector("#wordInput"),
  lookupPanel: document.querySelector("#lookupPanel"),
  lookupPreview: document.querySelector("#lookupPreview"),
  submitWord: document.querySelector("#submitWord"),
  nextNumber: document.querySelector("#nextNumber"),
  lastAdded: document.querySelector("#lastAdded"),
  emptyState: document.querySelector("#emptyState"),
  wordCard: document.querySelector("#wordCard"),
  currentNumber: document.querySelector("#currentNumber"),
  currentStatus: document.querySelector("#currentStatus"),
  wordGrid: document.querySelector(".word-grid"),
  currentWord: document.querySelector("#currentWord"),
  currentPronunciation: document.querySelector("#currentPronunciation"),
  currentMeaning: document.querySelector("#currentMeaning"),
  meaningBox: document.querySelector("#meaningBox"),
  toggleMeaning: document.querySelector("#toggleMeaning"),
  markKnown: document.querySelector("#markKnown"),
  markMissed: document.querySelector("#markMissed"),
  markNew: document.querySelector("#markNew"),
  prevWord: document.querySelector("#prevWord"),
  nextWord: document.querySelector("#nextWord"),
  manualMode: document.querySelector("#manualMode"),
  autoSpeed: document.querySelector("#autoSpeed"),
  speedLabel: document.querySelector("#speedLabel"),
  autoToggle: document.querySelector("#autoToggle"),
  orderMode: document.querySelector("#orderMode"),
  randomMode: document.querySelector("#randomMode"),
  wordTable: document.querySelector("#wordTable"),
  clearAll: document.querySelector("#clearAll"),
  exportWords: document.querySelector("#exportWords"),
  importWords: document.querySelector("#importWords"),
  importFile: document.querySelector("#importFile"),
  editModal: document.querySelector("#editModal"),
  editWordLabel: document.querySelector("#editWordLabel"),
  editMeaningInput: document.querySelector("#editMeaningInput"),
  editSave: document.querySelector("#editSave"),
  editCancel: document.querySelector("#editCancel"),
  editCancelTop: document.querySelector("#editCancelTop"),
  filters: Array.from(document.querySelectorAll("[data-filter]")),
  recordFilters: Array.from(document.querySelectorAll("[data-record-filter]")),
};

let editingWordId = null;

render();

el.wordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const word = el.wordInput.value.trim();
  if (!word) return;

  const duplicate = findDuplicateWord(word);
  if (duplicate) {
    state.currentId = duplicate.id;
    if (!state.reviewFilters.includes(duplicate.status)) {
      state.reviewFilters = [duplicate.status];
    }
    setLookupState("error", `Already saved as #${duplicate.id}: ${duplicate.word}.`);
    el.lastAdded.textContent = `Not saved: "${word}" is already saved as #${duplicate.id}.`;
    el.wordInput.focus();
    el.wordInput.select();
    render();
    return;
  }

  setLookupState("loading", `Fetching Chinese meanings for "${word}"...`);
  el.wordInput.disabled = true;
  el.submitWord.disabled = true;
  el.submitWord.textContent = "Fetching...";

  let lookup = null;
  try {
    lookup = await lookupMeaning(word);
  } catch (error) {
    console.warn("Meaning lookup failed; saving without Chinese meaning:", error);
    lookup = {
      meaning: "",
      source: "Manual entry needed",
      pronunciationAudio: "",
      missingMeaning: true,
    };
  } finally {
    el.wordInput.disabled = false;
    el.submitWord.disabled = false;
    el.submitWord.textContent = "Add Word + Fetch Meaning";
  }

  const nextId = getNextId();
  const item = {
    id: nextId,
    word,
    meaning: lookup.meaning || "",
    status: "new",
    source: lookup.source,
    pronunciationAudio: lookup.pronunciationAudio || "",
    createdAt: new Date().toISOString(),
  };

  state.words.push(item);
  state.currentId = item.id;
  saveWords();
  el.wordForm.reset();
  el.wordInput.focus();

  if (lookup.missingMeaning) {
    setLookupState("success", `Saved #${item.id}. No Chinese meaning was found, so it was left blank.`);
    el.lastAdded.textContent = `Saved #${item.id}: ${item.word}. Chinese meaning is blank.`;
  } else {
    setLookupState("success", `Saved #${item.id}: ${lookup.meaning}`);
    el.lastAdded.textContent = `Saved #${item.id}: ${item.word}.`;
  }

  render();
});

el.filters.forEach((button) => {
  button.addEventListener("click", () => {
    toggleStatusFilter(state.reviewFilters, button.dataset.filter);
    render();
  });
});

el.recordFilters.forEach((button) => {
  button.addEventListener("click", () => {
    state.recordFilters = [button.dataset.recordFilter];
    renderTable();
    renderMode();
  });
});

el.manualMode.addEventListener("click", () => {
  stopAuto();
  renderMode();
});

el.autoToggle.addEventListener("click", () => {
  if (state.autoTimer) {
    stopAuto();
  } else {
    startAuto();
  }
  renderMode();
});

el.orderMode.addEventListener("click", () => {
  state.mode = "order";
  render();
});

el.randomMode.addEventListener("click", () => {
  state.mode = "random";
  moveToRandom();
  render();
});

el.prevWord.addEventListener("click", () => moveBy(-1));
el.nextWord.addEventListener("click", () => moveBy(1));
el.currentPronunciation.addEventListener("click", () => playPronunciation(state.currentId));

el.markKnown.addEventListener("click", () => updateCurrentStatus("known"));
el.markMissed.addEventListener("click", () => updateCurrentStatus("unknown"));
el.markNew.addEventListener("click", () => updateCurrentStatus("new"));

el.toggleMeaning.addEventListener("click", () => {
  const revealed = el.meaningBox.classList.toggle("is-revealed");
  el.toggleMeaning.textContent = revealed ? "Hide Meaning" : "Reveal Meaning";
});

el.autoSpeed.addEventListener("input", () => {
  el.speedLabel.textContent = formatInterval(el.autoSpeed.value);
  if (state.autoTimer) {
    stopAuto();
    startAuto();
  }
  renderMode();
});

el.clearAll.addEventListener("click", () => {
  if (!state.words.length) return;
  const confirmed = window.confirm("Clear all saved words? This cannot be undone.");
  if (!confirmed) return;

  state.words = [];
  state.currentId = null;
  stopAuto();
  saveWords();
  render();
});

el.exportWords.addEventListener("click", exportWordsBackup);
el.importWords.addEventListener("click", () => el.importFile.click());
el.importFile.addEventListener("change", importWordsBackup);

el.editSave.addEventListener("click", saveEditedMeaning);
el.editCancel.addEventListener("click", closeEditModal);
el.editCancelTop.addEventListener("click", closeEditModal);
el.editModal.addEventListener("click", (event) => {
  if (event.target === el.editModal) closeEditModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.editModal.classList.contains("is-hidden")) {
    closeEditModal();
  }
});

el.wordTable.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const action = button.dataset.action;

  if (action === "pronounce") {
    playPronunciation(id);
    return;
  }

  if (action === "edit") {
    editWordMeaning(id);
    return;
  }

  if (action === "status") {
    updateWordStatus(id, button.dataset.status);
    return;
  }

  if (action === "show") {
    state.currentId = id;
    render();
    document.querySelector("#wordStage").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (action === "delete") {
    state.words = state.words.filter((item) => item.id !== id);
    if (state.currentId === id) {
      state.currentId = getDeck()[0]?.id ?? null;
    }
    saveWords();
    render();
  }
});

function render() {
  const deck = getDeck();
  if (!deck.some((item) => item.id === state.currentId)) {
    state.currentId = deck[0]?.id ?? null;
  }

  const current = state.words.find((item) => item.id === state.currentId) ?? null;

  renderStats();
  renderEntryNumber();
  renderMode();
  renderCurrent(current);
  renderTable();
  renderControlState(deck.length);
}

function renderStats() {
  el.countNew.textContent = countByStatus("new");
  el.countKnown.textContent = countByStatus("known");
  el.countMissed.textContent = countByStatus("unknown");
  el.countTotal.textContent = state.words.length;
}

function renderEntryNumber() {
  el.nextNumber.textContent = `#${getNextId()}`;
}

function setLookupState(type, message) {
  el.lookupPanel.classList.toggle("is-loading", type === "loading");
  el.lookupPanel.classList.toggle("is-error", type === "error");
  el.lookupPanel.classList.toggle("is-success", type === "success");
  el.lookupPreview.textContent = message;
}

function renderMode() {
  el.filters.forEach((button) => {
    const active = state.reviewFilters.includes(button.dataset.filter);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  el.recordFilters.forEach((button) => {
    const active = state.recordFilters.includes(button.dataset.recordFilter);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  el.orderMode.classList.toggle("is-active", state.mode === "order");
  el.randomMode.classList.toggle("is-active", state.mode === "random");
  el.manualMode.classList.toggle("is-active", !state.autoTimer);
  el.autoToggle.classList.toggle("is-active", Boolean(state.autoTimer));
}

function renderCurrent(current) {
  const hasCurrent = Boolean(current);
  el.emptyState.classList.toggle("is-hidden", hasCurrent);
  el.wordCard.classList.toggle("is-hidden", !hasCurrent);
  el.meaningBox.classList.remove("is-revealed", "meaning-medium", "meaning-long", "meaning-dense");
  el.toggleMeaning.textContent = "Reveal Meaning";

  if (!current) {
    renderCurrentTheme("new");
    return;
  }

  const displayMeaning = getDisplayMeaning(current);
  el.currentNumber.textContent = `#${current.id}`;
  el.currentWord.textContent = current.word;
  el.currentMeaning.textContent = displayMeaning;
  applyMeaningDensity(displayMeaning);
  renderCurrentPronunciation(current);
  renderCurrentTheme(current.status);
  el.currentStatus.textContent = statusText[current.status] ?? "New";
  el.currentStatus.className = `status-pill ${statusClass[current.status] ?? statusClass.new}`;
}

function renderCurrentTheme(status) {
  el.wordGrid.classList.remove("theme-new", "theme-known", "theme-unknown");
  el.wordGrid.classList.add(`theme-${status || "new"}`);
}

function renderCurrentPronunciation(item) {
  const available = isPronounceableWord(item.word);
  el.currentPronunciation.classList.toggle("is-hidden", !available);
  el.currentPronunciation.dataset.id = item.id;
}

function applyMeaningDensity(meaning) {
  const length = Array.from(String(meaning || "")).length;
  el.meaningBox.classList.toggle("meaning-medium", length > 18 && length <= 34);
  el.meaningBox.classList.toggle("meaning-long", length > 34 && length <= 58);
  el.meaningBox.classList.toggle("meaning-dense", length > 58);
}

function renderTable() {
  const records = getRecords();
  if (!records.length) {
    el.wordTable.innerHTML = `
      <tr>
        <td colspan="5" class="empty-row">No ${formatStatusList(state.recordFilters)} words in this list.</td>
      </tr>
    `;
    return;
  }

  const rows = records
    .sort((a, b) => a.id - b.id)
    .map((item) => {
      return `
        <tr>
          <td>#${item.id}</td>
          <td class="table-word">
            <span class="table-word-wrap">
              <span>${escapeHtml(item.word)}</span>
              ${renderTablePronunciation(item)}
            </span>
          </td>
          <td class="table-meaning" tabindex="0"><span>${escapeHtml(getDisplayMeaning(item))}</span></td>
          <td>${renderStatusButtons(item)}</td>
          <td>
            <div class="row-actions">
              <button class="mini-button edit" type="button" data-action="edit" data-id="${item.id}">Edit</button>
              <button class="mini-button" type="button" data-action="show" data-id="${item.id}">Review</button>
              <button class="mini-button delete" type="button" data-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  el.wordTable.innerHTML = rows;
}

function renderStatusButtons(item) {
  return `
    <div class="status-buttons" aria-label="Change word status">
      <button class="status-dot status-dot-new ${item.status === "new" ? "is-selected" : ""}" type="button" data-action="status" data-status="new" data-id="${item.id}" title="New" aria-label="Set as New"></button>
      <button class="status-dot status-dot-known ${item.status === "known" ? "is-selected" : ""}" type="button" data-action="status" data-status="known" data-id="${item.id}" title="Known" aria-label="Set as Known"></button>
      <button class="status-dot status-dot-unknown ${item.status === "unknown" ? "is-selected" : ""}" type="button" data-action="status" data-status="unknown" data-id="${item.id}" title="Unknown" aria-label="Set as Unknown"></button>
    </div>
  `;
}

function updateWordStatus(id, status) {
  if (!statusText[status]) return;

  const item = state.words.find((word) => word.id === Number(id));
  if (!item) return;

  item.status = status;
  saveWords();
  render();
}

function editWordMeaning(id) {
  const item = state.words.find((word) => word.id === Number(id));
  if (!item) return;

  const currentMeaning = item.meaningEdited ? item.meaning : getDisplayMeaning(item);
  editingWordId = item.id;
  el.editWordLabel.textContent = `#${item.id} ${item.word}`;
  el.editMeaningInput.value = currentMeaning;
  el.editModal.classList.remove("is-hidden");
  window.setTimeout(() => {
    el.editMeaningInput.focus();
    el.editMeaningInput.select();
  }, 0);
}

function saveEditedMeaning() {
  const item = state.words.find((word) => word.id === Number(editingWordId));
  if (!item) return;

  const cleaned = el.editMeaningInput.value.trim();
  if (!cleaned) return;

  item.meaning = cleaned;
  item.meaningEdited = true;
  item.editedAt = new Date().toISOString();
  saveWords();
  closeEditModal();
  render();
}

function closeEditModal() {
  editingWordId = null;
  el.editModal.classList.add("is-hidden");
}

function exportWordsBackup() {
  const payload = {
    app: "Daily Vocabulary of Shiju Gu",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    words: state.words,
  };
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daily-vocabulary-backup-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  el.lastAdded.textContent = `Exported ${state.words.length} saved words.`;
}

async function importWordsBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const importedWords = normalizeImportedWords(payload);
    if (!importedWords.length) {
      throw new Error("No words were found in this backup.");
    }

    const result = mergeImportedWords(importedWords);
    if (result.added > 0) {
      saveWords();
      if (!state.currentId) state.currentId = result.firstImportedId;
      render();
    }

    el.lastAdded.textContent = `Imported ${result.added} words. Skipped ${result.skipped} duplicates.`;
    setLookupState("success", `Import complete: ${result.added} added, ${result.skipped} skipped.`);
  } catch (error) {
    console.warn("Import failed:", error);
    setLookupState("error", "Import failed. Please choose a Daily Vocabulary JSON backup.");
    el.lastAdded.textContent = "Import failed: the backup file could not be read.";
  }
}

function normalizeImportedWords(payload) {
  const rawWords = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.words)
      ? payload.words
      : [];

  return rawWords
    .map((item) => ({
      id: Number(item.id),
      word: String(item.word || "").trim(),
      meaning: String(item.meaning || ""),
      status: statusText[item.status] ? item.status : "new",
      source: String(item.source || "Imported backup"),
      pronunciationAudio: String(item.pronunciationAudio || ""),
      meaningEdited: Boolean(item.meaningEdited),
      createdAt: item.createdAt || new Date().toISOString(),
      editedAt: item.editedAt || "",
    }))
    .filter((item) => item.word);
}

function mergeImportedWords(importedWords) {
  const existingKeys = new Set(state.words.map((item) => normalizeWordKey(item.word)));
  const usedIds = new Set(state.words.map((item) => Number(item.id)).filter(Number.isFinite));
  let nextId = getNextId();
  let added = 0;
  let skipped = 0;
  let firstImportedId = null;

  importedWords.forEach((item) => {
    const key = normalizeWordKey(item.word);
    if (!key || existingKeys.has(key)) {
      skipped += 1;
      return;
    }

    let id = Number.isInteger(item.id) && item.id > 0 && !usedIds.has(item.id)
      ? item.id
      : nextId;
    while (usedIds.has(id)) id += 1;
    nextId = Math.max(nextId, id + 1);

    usedIds.add(id);
    existingKeys.add(key);
    state.words.push({ ...item, id });
    if (firstImportedId === null) firstImportedId = id;
    added += 1;
  });

  return { added, skipped, firstImportedId };
}

function renderTablePronunciation(item) {
  if (!isPronounceableWord(item.word)) return "";
  return `<button class="pronounce-button table-pronounce" type="button" data-action="pronounce" data-id="${item.id}" title="Play American pronunciation" aria-label="Play American pronunciation"><span aria-hidden="true">US</span></button>`;
}

async function playPronunciation(id) {
  const item = state.words.find((word) => word.id === Number(id));
  if (!item || !isPronounceableWord(item.word)) return;

  const buttons = Array.from(document.querySelectorAll(`[data-action="pronounce"][data-id="${item.id}"], #currentPronunciation[data-id="${item.id}"]`));
  buttons.forEach((button) => button.classList.add("is-loading"));

  try {
    const audio = new Audio(getPronunciationAudioUrl(item.word));
    audio.preload = "auto";
    await audio.play();
  } catch (error) {
    console.warn("Pronunciation playback failed:", error);
  } finally {
    buttons.forEach((button) => button.classList.remove("is-loading"));
  }
}

function getPronunciationAudioUrl(word) {
  const params = new URLSearchParams({ word });
  return `${getApiEndpoint("/api/audio", localAudioEndpoint)}?${params.toString()}`;
}

async function fetchPronunciation(word) {
  const params = new URLSearchParams({ word });
  const data = await fetchJson(`${getApiEndpoint("/api/pronunciation", localPronunciationEndpoint)}?${params.toString()}`);
  if (!data?.audioUrl) {
    throw new Error("No Cambridge US pronunciation audio found");
  }
  return data.audioUrl;
}

function isPronounceableWord(word) {
  return /^[A-Za-z]+$/.test(String(word || "").trim());
}

function renderControlState(deckLength) {
  const disabled = deckLength === 0;
  [el.prevWord, el.nextWord, el.markKnown, el.markMissed, el.markNew, el.manualMode, el.autoToggle].forEach((button) => {
    button.disabled = disabled;
  });

  if (disabled) stopAuto();
}

function getDeck() {
  const filtered = state.words.filter((item) => state.reviewFilters.includes(item.status));

  return [...filtered].sort((a, b) => a.id - b.id);
}

function getRecords() {
  return state.words.filter((item) => state.recordFilters.includes(item.status));
}

function toggleStatusFilter(filters, status) {
  const index = filters.indexOf(status);
  if (index >= 0) {
    if (filters.length === 1) return;
    filters.splice(index, 1);
    return;
  }

  filters.push(status);
}

function formatStatusList(filters) {
  return filters.map((status) => statusText[status] ?? status).join(" + ");
}

function getNextId() {
  const maxId = state.words.reduce((max, item) => Math.max(max, item.id), 0);
  return maxId + 1;
}

function countByStatus(status) {
  return state.words.filter((item) => item.status === status).length;
}

function findDuplicateWord(word) {
  const key = normalizeWordKey(word);
  if (!key) return null;
  return state.words.find((item) => normalizeWordKey(item.word) === key) ?? null;
}

function normalizeWordKey(word) {
  return String(word || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function lookupMeaning(word) {
  const cleanWord = word.trim();
  try {
    return await lookupServerMeaning(cleanWord);
  } catch (error) {
    console.warn("Local source lookup failed, using fallback:", error);
    if (isSpellingLookupError(error)) {
      throw createSpellingLookupError(cleanWord);
    }
  }

  const [directResult, dictionaryResult, datamuseResult] = await Promise.allSettled([
    translateToChinese(cleanWord),
    fetchDictionarySenses(cleanWord),
    fetchDatamuseSenses(cleanWord),
  ]);

  const directMeaning = directResult.status === "fulfilled" ? directResult.value : "";
  const dictionarySenses = dictionaryResult.status === "fulfilled" ? dictionaryResult.value : [];
  const datamuseSenses = datamuseResult.status === "fulfilled" ? datamuseResult.value : [];
  const senses = uniqueSenses([...dictionarySenses, ...datamuseSenses]).slice(0, 8);

  if (!senses.length) {
    throw createSpellingLookupError(cleanWord);
  }

  const translatedSenses = [];

  for (const sense of senses) {
    try {
      const zh = await translateToChinese(sense.definition);
      if (zh && !looksEnglishOnly(zh)) {
        translatedSenses.push({ ...sense, zh });
      }
    } catch (error) {
      console.warn("Definition translation failed:", error);
    }
  }

  const meaning = formatChineseMeaning(cleanWord, directMeaning, translatedSenses);
  if (!meaning) {
    throw createSpellingLookupError(cleanWord);
  }

  const sourceParts = [];
  if (dictionarySenses.length) sourceParts.push("DictionaryAPI");
  if (datamuseSenses.length) sourceParts.push("Datamuse/WordNet/Wiktionary");
  sourceParts.push("MyMemory translation");

  return {
    meaning,
    source: sourceParts.join(" + "),
    summary: translatedSenses.length ? "Short meanings summarized." : "Direct translation saved.",
  };
}

async function lookupServerMeaning(word) {
  const params = new URLSearchParams({ word });
  const data = await fetchJson(`${getApiEndpoint("/api/meaning", localMeaningEndpoint)}?${params.toString()}`);
  const meaning = normalizeMeaning(data?.meaning);

  if (!meaning) {
    throw new Error("Local source lookup returned no meaning");
  }

  return {
    meaning,
    source: Array.isArray(data.sources) && data.sources.length
      ? data.sources.join(" + ")
      : "Merriam-Webster + Cambridge + dict.cn + Dictionary.com",
    pronunciationAudio: data.pronunciationAudio || "",
    summary: "Short meanings summarized from dictionary sources.",
  };
}

function getApiEndpoint(path, localEndpoint) {
  if (configuredApiBase) {
    return `${configuredApiBase}${path}`;
  }

  return window.location.protocol.startsWith("http")
    ? path
    : localEndpoint;
}

function createSpellingLookupError(word) {
  const error = new Error(`Possible spelling error: ${word}`);
  error.code = "spelling_not_found";
  return error;
}

function isSpellingLookupError(error) {
  return error?.code === "spelling_not_found" || error?.payload?.code === "spelling_not_found";
}

async function fetchDictionarySenses(word) {
  const url = `${dictionaryEndpoint}${encodeURIComponent(word)}`;
  const data = await fetchJson(url);
  if (!Array.isArray(data)) return [];

  const senses = [];
  data.forEach((entry) => {
    (entry.meanings ?? []).forEach((meaning) => {
      (meaning.definitions ?? []).forEach((definition) => {
        if (!definition.definition) return;
        senses.push({
          pos: meaning.partOfSpeech || "meaning",
          definition: cleanDefinition(definition.definition),
          source: "DictionaryAPI",
        });
      });
    });
  });

  return senses;
}

async function fetchDatamuseSenses(word) {
  const params = new URLSearchParams({
    sp: word,
    md: "d",
    max: "1",
  });
  const data = await fetchJson(`${datamuseEndpoint}?${params.toString()}`);
  if (!Array.isArray(data) || !data.length) return [];

  const exact = data.find((item) => normalizeWordKey(item.word) === normalizeWordKey(word));
  if (!exact) return [];

  return (exact.defs ?? [])
    .map((entry) => parseDatamuseDefinition(entry))
    .filter(Boolean);
}

async function translateToChinese(text) {
  const params = new URLSearchParams({
    q: trimForTranslation(text),
    langpair: "en|zh-CN",
  });

  const data = await fetchJson(`${translationEndpoint}?${params.toString()}`);
  const responseStatus = Number(data?.responseStatus ?? 200);
  const translated = decodeHtml(String(data?.responseData?.translatedText ?? "").trim());

  if (responseStatus >= 400 || !translated) {
    throw new Error(data?.responseDetails || "No translated text returned");
  }

  return translated.replace(/\s+/g, " ");
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        payload = null;
      }

      const error = new Error(payload?.error || `Request failed with ${response.status}`);
      error.status = response.status;
      error.code = payload?.code;
      error.payload = payload;
      throw error;
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function uniqueSenses(senses) {
  const seen = new Set();
  const unique = [];

  senses.forEach((sense) => {
    const definition = cleanDefinition(sense.definition);
    const key = definition.toLowerCase();
    if (!definition || seen.has(key)) return;
    seen.add(key);
    unique.push({ ...sense, definition });
  });

  return unique;
}

function parseDatamuseDefinition(entry) {
  if (!entry) return null;
  const [rawPos, ...rest] = entry.split("\t");
  const definition = cleanDefinition(rest.join(" "));
  if (!definition) return null;

  return {
    pos: partOfSpeechText[rawPos] || rawPos || "meaning",
    definition,
    source: "Datamuse",
  };
}

function formatChineseMeaning(word, directMeaning, translatedSenses) {
  const wordKey = word.toLowerCase();
  if (wordSpecificMeanings[wordKey]) {
    return wordSpecificMeanings[wordKey].join("；");
  }

  const phrases = [];
  const addPhrase = (phrase) => {
    const clean = normalizeMeaning(phrase);
    if (!clean || looksEnglishOnly(clean) || phrases.includes(clean)) return;
    phrases.push(clean);
  };

  translatedSenses.forEach((sense) => {
    const rulePhrase = phraseFromDefinition(sense.definition);
    if (rulePhrase) addPhrase(rulePhrase);
  });

  addPhrase(compactChinesePhrase(directMeaning));

  translatedSenses.forEach((sense) => {
    addPhrase(compactChinesePhrase(sense.zh));
  });

  return phrases.slice(0, 6).join("；");
}

function getDisplayMeaning(item) {
  if (item.meaningEdited) return item.meaning;
  return compactStoredMeaning(item.word, item.meaning) || item.meaning;
}

function compactStoredMeaning(word, meaning) {
  const wordKey = String(word ?? "").toLowerCase();
  if (wordSpecificMeanings[wordKey]) {
    return wordSpecificMeanings[wordKey].join("；");
  }

  const normalized = normalizeMeaning(meaning);
  const alreadyShort = normalized.length <= 34 && !normalized.includes("\n") && !/[A-Za-z ]+[:：]/.test(normalized);
  if (alreadyShort) return normalized;

  const phrases = [];
  String(meaning ?? "")
    .split(/[\n；;]/)
    .forEach((part) => {
      const phrase = compactChinesePhrase(part);
      if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
    });

  return phrases.slice(0, 6).join("；");
}

function phraseFromDefinition(definition) {
  const text = cleanDefinition(definition);
  const match = sensePhraseRules.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  return match?.phrase ?? "";
}

function compactChinesePhrase(value) {
  const text = normalizeMeaning(value)
    .replace(/^[A-Za-z ]+[:：]\s*/, "")
    .replace(/^常见[:：]\s*/, "")
    .replace(/^(一种|一个|一件|一名|某种|某个|任何|指的是|指|表示)\s*/, "");

  if (!text || looksEnglishOnly(text)) return "";

  const firstClause = text
    .split(/[。；;，,：:]/)
    .map((part) => part.trim())
    .find((part) => part && !looksEnglishOnly(part));

  const phrase = firstClause || text;
  if (phrase.length <= 14) return phrase;

  const shortMatch = phrase.match(/[\u3400-\u9fffA-Za-z0-9]+/u);
  return shortMatch ? shortMatch[0].slice(0, 12) : phrase.slice(0, 12);
}

function cleanDefinition(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimForTranslation(value) {
  return cleanDefinition(value).slice(0, 450);
}

function normalizeMeaning(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+([;,.!?])/g, "$1")
    .trim();
}

function formatInterval(value) {
  const seconds = Number(value);
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`;
}

function looksEnglishOnly(value) {
  return /^[\x00-\x7F]+$/.test(value);
}

function moveBy(direction) {
  const deck = getDeck();
  if (!deck.length) return;

  if (state.mode === "random") {
    moveToRandom();
    render();
    return;
  }

  const currentIndex = Math.max(0, deck.findIndex((item) => item.id === state.currentId));
  const nextIndex = (currentIndex + direction + deck.length) % deck.length;
  state.currentId = deck[nextIndex].id;
  render();
}

function moveToRandom() {
  const deck = getDeck();
  if (!deck.length) return;

  if (deck.length === 1) {
    state.currentId = deck[0].id;
    return;
  }

  const choices = deck.filter((item) => item.id !== state.currentId);
  const randomIndex = Math.floor(Math.random() * choices.length);
  state.currentId = choices[randomIndex].id;
}

function updateCurrentStatus(status) {
  const current = state.words.find((item) => item.id === state.currentId);
  if (!current) return;

  current.status = status;
  saveWords();

  const deckAfterUpdate = getDeck();
  if (!deckAfterUpdate.some((item) => item.id === current.id)) {
    state.currentId = deckAfterUpdate[0]?.id ?? null;
  }

  render();
}

function startAuto() {
  const deck = getDeck();
  if (!deck.length) return;

  stopAuto();
  state.autoTimer = window.setInterval(() => {
    moveBy(1);
  }, Number(el.autoSpeed.value) * 1000);
}

function stopAuto() {
  if (!state.autoTimer) return;

  window.clearInterval(state.autoTimer);
  state.autoTimer = null;
}

function loadWords() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const words = raw ? JSON.parse(raw) : [];
    return words.map((item) => ({
      ...item,
      status: item.status === "missed" ? "unknown" : item.status,
    }));
  } catch (error) {
    console.warn("Could not load words:", error);
    return [];
  }
}

function saveWords() {
  window.localStorage.setItem(storageKey, JSON.stringify(state.words));
}

if ("serviceWorker" in navigator && ["https:", "http:"].includes(window.location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

function decodeHtml(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
