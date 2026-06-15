const TOTAL_DAYS = 56;
const DAYS_PER_WEEK = 7;
const STORAGE_KEY = "workEnglishStudyProgress.v1";

let cards = [];
let currentDayIndex = Number(localStorage.getItem("workEnglishStudyDay") || "1");
let activeMode = localStorage.getItem("workEnglishStudyMode") || "daily";
let activeFilter = loadSavedFilter();
let availableVoices = [];
let currentUtteranceText = "";

const FILTERS = {
  category: [
    "Core R&D Communication",
    "Experimental Design and Assay Conditions",
    "Data Interpretation",
    "Antibody Discovery and Screening",
    "SPR / FACS / ELISA",
    "TCE / Bispecific / Conditional Activation",
    "Vendor / CRO / External Communication",
    "Internal Reporting / Presentation / Decision Making",
  ],
  difficulty: ["Basic", "Intermediate", "Advanced"],
  use_case: ["Email", "Meeting", "Report", "Presentation", "Vendor", "Data Interpretation"],
};

function clampDay(value) {
  return Math.min(Math.max(value, 1), TOTAL_DAYS);
}

function dayToWeekDay(dayIndex) {
  const week = Math.floor((dayIndex - 1) / DAYS_PER_WEEK) + 1;
  const day = ((dayIndex - 1) % DAYS_PER_WEEK) + 1;
  return { week, day };
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadSavedFilter() {
  try {
    const raw = localStorage.getItem("workEnglishStudyFilter");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveFilter() {
  if (activeFilter) {
    localStorage.setItem("workEnglishStudyFilter", JSON.stringify(activeFilter));
  } else {
    localStorage.removeItem("workEnglishStudyFilter");
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function speechSupported() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function refreshVoices() {
  if (!speechSupported()) return;
  availableVoices = window.speechSynthesis.getVoices();
}

function preferredVoice() {
  if (!speechSupported()) return null;
  refreshVoices();
  const mode = document.getElementById("voice-mode")?.value || "auto";
  const targets = mode === "auto" ? ["en-US", "en-GB"] : [mode];
  for (const lang of targets) {
    const exact = availableVoices.find((voice) => voice.lang === lang);
    if (exact) return exact;
    const prefix = availableVoices.find((voice) => voice.lang && voice.lang.startsWith(lang));
    if (prefix) return prefix;
  }
  return availableVoices.find((voice) => voice.lang && voice.lang.startsWith("en")) || null;
}

function speakEnglish(text) {
  if (!speechSupported()) {
    alert("This browser does not support speech synthesis.");
    return;
  }
  if (window.speechSynthesis.speaking && currentUtteranceText === text) {
    window.speechSynthesis.cancel();
    currentUtteranceText = "";
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = preferredVoice();
  const selectedRate = Number(document.getElementById("voice-rate")?.value || "1.0");
  utterance.lang = selectedVoice?.lang || document.getElementById("voice-mode")?.value || "en-US";
  utterance.voice = selectedVoice;
  utterance.rate = selectedRate;
  utterance.pitch = 1.0;
  utterance.onend = () => { currentUtteranceText = ""; };
  utterance.onerror = () => { currentUtteranceText = ""; };
  currentUtteranceText = text;
  window.speechSynthesis.speak(utterance);
}

function updateSpeechSupportMessage() {
  const element = document.getElementById("speech-support");
  if (!element) return;
  element.textContent = speechSupported()
    ? "Voice: browser TTS ready"
    : "Voice: speech synthesis is not supported in this browser";
  document.querySelectorAll("[data-speak-card]").forEach((button) => {
    button.disabled = !speechSupported();
  });
}

function getStatus(cardId) {
  return loadProgress()[cardId] || "Not studied";
}

function setStatus(cardId, status) {
  const progress = loadProgress();
  if (status === "Not studied") {
    delete progress[cardId];
  } else {
    progress[cardId] = status;
  }
  saveProgress(progress);
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(text) {
  return `<span class="badge">${escapeHtml(text)}</span>`;
}

function tagBadge(type, text) {
  const label = type === "use_case" ? "Use case" : type[0].toUpperCase() + type.slice(1);
  return `<button class="badge" type="button" data-tag-type="${type}" data-tag-value="${escapeHtml(text)}" aria-label="Filter by ${label}: ${escapeHtml(text)}">${escapeHtml(text)}</button>`;
}

function applyTagFilter(type, value) {
  activeFilter = { type, value };
  activeMode = "tag";
  localStorage.setItem("workEnglishStudyMode", activeMode);
  saveFilter();
  render();
}

function clearFilter() {
  activeFilter = null;
  saveFilter();
  render();
}

function filterLabel(filter) {
  if (!filter) return "No tag filter selected.";
  const label = filter.type === "use_case" ? "Use case" : filter.type[0].toUpperCase() + filter.type.slice(1);
  return `${label}: ${filter.value}`;
}

function filteredCards() {
  if (!activeFilter) return cards;
  return cards.filter((card) => card[activeFilter.type] === activeFilter.value);
}

function cardHtml(card) {
  const status = getStatus(card.id);
  const drills = Array.isArray(card.substitution_drills) ? card.substitution_drills : [];
  return `
    <article class="card" data-card-id="${escapeHtml(card.id)}">
      <div class="card-top">
        <div class="card-id">${escapeHtml(card.id)} · Week ${card.week} Day ${card.day}</div>
        <div>${badge(status)}</div>
      </div>
      <div class="korean">${escapeHtml(card.korean)}</div>
      <div class="answer-actions">
        <button class="answer-button" type="button" data-answer-button="${escapeHtml(card.id)}">Show Answer</button>
        <button class="speak-button" type="button" data-speak-card="${escapeHtml(card.id)}">▶ 발음</button>
      </div>
      <div class="answer hidden" id="answer-${escapeHtml(card.id)}">
        <div class="english">${escapeHtml(card.english)}</div>
        <details class="details" open>
          <summary>Chunk / Pattern / Substitution Drills</summary>
          <p><strong>Chunk</strong><br>${escapeHtml(card.chunk)}</p>
          <p><strong>Pattern</strong><br>${escapeHtml(card.pattern)}</p>
          <p><strong>Substitution drills</strong></p>
          <ul>${drills.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </details>
      </div>
      <div class="tags">
        ${tagBadge("category", card.category)}
        ${tagBadge("difficulty", card.difficulty)}
        ${tagBadge("use_case", card.use_case)}
      </div>
      <div class="progress-buttons" aria-label="Progress buttons">
        <button class="state-button not-yet ${status === "Not studied" ? "active" : ""}" type="button" data-status-card="${escapeHtml(card.id)}" data-status-value="Not studied">아직</button>
        <button class="state-button learned ${status === "Mastered" ? "active" : ""}" type="button" data-status-card="${escapeHtml(card.id)}" data-status-value="Mastered">익혔다</button>
        <button class="state-button review ${status === "Need review" ? "active" : ""}" type="button" data-status-card="${escapeHtml(card.id)}" data-status-value="Need review">다시 볼 문장</button>
      </div>
    </article>
  `;
}

function reviewCardHtml(card) {
  return cardHtml(card);
}

function dayCards() {
  const { week, day } = dayToWeekDay(currentDayIndex);
  return cards
    .filter((card) => card.week === week && card.day === day)
    .sort((a, b) => a.sentence_number - b.sentence_number);
}

function updateSummary() {
  const progress = loadProgress();
  const values = Object.values(progress);
  const needReview = values.filter((value) => value === "Need review").length;
  const mastered = values.filter((value) => value === "Mastered").length;
  const notYet = Math.max(cards.length - mastered - needReview, 0);
  document.getElementById("mastered-count").textContent = `익힌 문장: ${mastered}`;
  document.getElementById("review-count").textContent = `다시 볼 문장: ${needReview}`;
  document.getElementById("not-yet-count").textContent = `아직: ${notYet}`;
  document.getElementById("total-progress").textContent = `${mastered} / ${cards.length} 익힘`;
}

function bindCardEvents() {
  document.querySelectorAll("[data-tag-type]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTagFilter(button.getAttribute("data-tag-type"), button.getAttribute("data-tag-value"));
    });
  });

  document.querySelectorAll("[data-answer-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const cardId = button.getAttribute("data-answer-button");
      const answer = document.getElementById(`answer-${cardId}`);
      const isHidden = answer.classList.toggle("hidden");
      button.textContent = isHidden ? "Show Answer" : "Hide Answer";
    });
  });

  document.querySelectorAll("[data-speak-card]").forEach((button) => {
    button.disabled = !speechSupported();
    button.addEventListener("click", () => {
      const cardId = button.getAttribute("data-speak-card");
      const card = cards.find((item) => item.id === cardId);
      if (card) speakEnglish(card.english);
    });
  });

  document.querySelectorAll("[data-status-card]").forEach((button) => {
    button.addEventListener("click", () => {
      setStatus(button.getAttribute("data-status-card"), button.getAttribute("data-status-value"));
    });
  });
}

function renderModeMenu() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-mode") === activeMode);
  });
}

function renderFilterControls(resultCount) {
  const panel = document.getElementById("filter-panel");
  panel.classList.toggle("hidden", activeMode !== "tag");
  if (activeMode !== "tag") return;

  document.getElementById("filter-status").textContent = activeFilter
    ? `Showing ${resultCount} cards for ${filterLabel(activeFilter)}`
    : `Showing all ${resultCount} cards. Select a tag filter.`;

  const groupTitles = {
    category: "Category filters",
    difficulty: "Difficulty filters",
    use_case: "Use case filters",
  };
  document.getElementById("filter-groups").innerHTML = Object.entries(FILTERS).map(([type, values]) => `
    <div class="filter-group">
      <h3>${groupTitles[type]}</h3>
      <div class="filter-buttons">
        ${values.map((value) => {
          const active = activeFilter && activeFilter.type === type && activeFilter.value === value;
          return `<button class="tag-button ${active ? "active" : ""}" type="button" data-filter-type="${type}" data-filter-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
        }).join("")}
      </div>
    </div>
  `).join("");

  document.querySelectorAll("[data-filter-type]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTagFilter(button.getAttribute("data-filter-type"), button.getAttribute("data-filter-value"));
    });
  });
}

function renderDaily() {
  currentDayIndex = clampDay(currentDayIndex);
  localStorage.setItem("workEnglishStudyDay", String(currentDayIndex));
  const { week, day } = dayToWeekDay(currentDayIndex);
  const visibleCards = dayCards();

  document.getElementById("week-day-label").textContent = `Week ${week} / Day ${day}`;
  document.getElementById("day-count-label").textContent = `Day ${currentDayIndex} of ${TOTAL_DAYS}`;
  document.getElementById("prev-day").disabled = currentDayIndex <= 1;
  document.getElementById("next-day").disabled = currentDayIndex >= TOTAL_DAYS;

  const masteredForDay = visibleCards.filter((card) => getStatus(card.id) === "Mastered").length;
  document.getElementById("day-progress").textContent =
    `${visibleCards.length} cards today · ${masteredForDay} mastered`;
  document.getElementById("cards").innerHTML = visibleCards.map(cardHtml).join("");
}

function renderTagReview() {
  const results = filteredCards();
  document.getElementById("day-progress").textContent = activeFilter
    ? `Showing ${results.length} cards for ${filterLabel(activeFilter)}`
    : `Showing all ${results.length} cards. Choose a filter above or click any card badge.`;
  document.getElementById("cards").innerHTML = results.map(reviewCardHtml).join("");
  renderFilterControls(results.length);
}

function renderNeedReview() {
  const results = cards.filter((card) => getStatus(card.id) === "Need review");
  document.getElementById("day-progress").textContent = `${results.length} cards marked Need review`;
  document.getElementById("cards").innerHTML = results.length
    ? results.map(reviewCardHtml).join("")
    : `<article class="card"><strong>No cards need review.</strong><p>Cards marked Need review will appear here.</p></article>`;
}

function render() {
  localStorage.setItem("workEnglishStudyMode", activeMode);
  renderModeMenu();
  document.querySelector(".day-nav").classList.toggle("hidden", activeMode !== "daily");
  document.getElementById("filter-panel").classList.toggle("hidden", activeMode !== "tag");

  if (activeMode === "daily") {
    renderDaily();
  } else if (activeMode === "tag") {
    renderTagReview();
  } else {
    renderNeedReview();
  }
  bindCardEvents();
  updateSpeechSupportMessage();
  updateSummary();
}

async function init() {
  currentDayIndex = clampDay(currentDayIndex);
  refreshVoices();
  if (speechSupported()) {
    window.speechSynthesis.onvoiceschanged = () => {
      refreshVoices();
      updateSpeechSupportMessage();
    };
  }
  const response = await fetch("data/sentences.json");
  if (!response.ok) {
    throw new Error("Could not load data/sentences.json");
  }
  cards = await response.json();
  render();
}

document.getElementById("prev-day").addEventListener("click", () => {
  currentDayIndex = clampDay(currentDayIndex - 1);
  render();
});

document.getElementById("next-day").addEventListener("click", () => {
  currentDayIndex = clampDay(currentDayIndex + 1);
  render();
});

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    activeMode = button.getAttribute("data-mode");
    render();
  });
});

document.getElementById("clear-filter").addEventListener("click", clearFilter);
document.getElementById("voice-mode").addEventListener("change", () => window.speechSynthesis?.cancel());
document.getElementById("voice-rate").addEventListener("change", () => window.speechSynthesis?.cancel());

init().catch((error) => {
  document.getElementById("cards").innerHTML =
    `<article class="card"><strong>Failed to load study data.</strong><p>${escapeHtml(error.message)}</p></article>`;
});
