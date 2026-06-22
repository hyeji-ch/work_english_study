const TOTAL_DAYS = 30;
const DAYS_PER_WEEK = 5;
const DATA_VERSION = "20260622-150-v2";
const STATE_KEY = "workEnglish:state";

let cards = [];
let voices = [];
let flashIndex = 0;
let flashFlipped = false;
let selectedSituation = null;
let selectedPattern = null;

const defaultState = {
  currentDay: 1,
  cardProgress: {},
  completedDays: {},
  activeView: "today",
  selectedFilter: { category: "All", use_case: "All", difficulty: "All" },
  ttsSettings: { lang: "en-US", rate: 1.0, pitch: 1.0 }
};

function loadState() {
  try {
    return { ...defaultState, ...(JSON.parse(localStorage.getItem(STATE_KEY)) || {}) };
  } catch {
    return structuredClone(defaultState);
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function clampDay(day) {
  return Math.min(Math.max(day, 1), TOTAL_DAYS);
}

function dayToWeekDay(dayIndex) {
  return { week: Math.floor((dayIndex - 1) / DAYS_PER_WEEK) + 1, day: ((dayIndex - 1) % DAYS_PER_WEEK) + 1 };
}

function weekDayToIndex(week, day) {
  return (week - 1) * DAYS_PER_WEEK + day;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusOf(cardId) {
  return state.cardProgress[cardId] || "Not studied";
}

function setStatus(cardId, status) {
  if (status === "Not studied") delete state.cardProgress[cardId];
  else state.cardProgress[cardId] = status;
  updateCompletedDays();
  saveState();
  render();
}

function updateCompletedDays() {
  state.completedDays = {};
  for (let dayIndex = 1; dayIndex <= TOTAL_DAYS; dayIndex += 1) {
    const { week, day } = dayToWeekDay(dayIndex);
    const dayCards = cards.filter((card) => card.week === week && card.day === day);
    if (dayCards.length === 5 && dayCards.every((card) => statusOf(card.id) === "Mastered")) {
      state.completedDays[String(dayIndex)] = true;
    }
  }
}

function dashboardCounts() {
  const values = Object.values(state.cardProgress);
  return {
    mastered: values.filter((value) => value === "Mastered").length,
    review: values.filter((value) => value === "Need review").length,
    completedDays: Object.keys(state.completedDays).length
  };
}

function badge(text, extra = "") {
  return `<span class="badge ${extra}">${escapeHtml(text)}</span>`;
}

function stateButtons(card) {
  const current = statusOf(card.id);
  return `<div class="state-row">
    <span class="state-label">학습 상태</span>
    <button class="btn gray ${current === "Not studied" ? "on" : ""}" data-status-card="${card.id}" data-status-value="Not studied">아직</button>
    <button class="btn primary ${current === "Mastered" ? "on" : ""}" data-status-card="${card.id}" data-status-value="Mastered">익혔다</button>
    <button class="btn olive ${current === "Need review" ? "on" : ""}" data-status-card="${card.id}" data-status-value="Need review" title="다시 볼 문장" aria-label="다시 볼 문장">다시</button>
  </div>`;
}

function answerBlock(card) {
  const drills = Array.isArray(card.substitution_drills) ? card.substitution_drills : [];
  return `<div class="answer hidden" id="answer-${card.id}">
    <div class="english">${escapeHtml(card.english)}</div>
    <details>
      <summary>Chunk / Pattern / Drill</summary>
      <p><strong>Chunk</strong><br>${escapeHtml(card.chunk)}</p>
      <p><strong>Pattern</strong><br>${escapeHtml(card.pattern)}</p>
      <ul>${drills.map((drill) => `<li>${escapeHtml(drill)}</li>`).join("")}</ul>
    </details>
  </div>`;
}

function sentenceCard(card) {
  return `<article class="sentence-card">
    <div class="meta-row">
      ${badge(card.id)}
      ${badge(card.category)}
      ${badge(card.use_case)}
      ${badge(card.difficulty)}
    </div>
    <div class="ko">${escapeHtml(card.korean)}</div>
    <div class="answer-actions">
      <button class="btn primary" data-toggle-answer="${card.id}">정답 보기</button>
      <button class="btn icon-btn" data-speak-card="${card.id}" title="발음 듣기" aria-label="발음 듣기">🔊</button>
    </div>
    ${answerBlock(card)}
    ${stateButtons(card)}
  </article>`;
}

function speak(text) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    alert("이 브라우저는 SpeechSynthesis를 지원하지 않습니다.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const usVoice = voices.find((voice) => voice.lang === "en-US") || voices.find((voice) => voice.lang?.startsWith("en"));
  utterance.lang = "en-US";
  utterance.voice = usVoice || null;
  utterance.rate = state.ttsSettings.rate || 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

function dayCards() {
  const { week, day } = dayToWeekDay(state.currentDay);
  return cards
    .filter((card) => card.week === week && card.day === day)
    .sort((a, b) => a.sentence_number - b.sentence_number);
}

function renderDashboard() {
  const counts = dashboardCounts();
  document.getElementById("dash-day").innerHTML = `${state.currentDay}<span class="small">/30</span>`;
  document.getElementById("dash-mastered").textContent = counts.mastered;
  document.getElementById("dash-review").textContent = counts.review;
}

function renderToday() {
  const { week, day } = dayToWeekDay(state.currentDay);
  const current = dayCards();
  document.getElementById("view-today").innerHTML = `
    <div class="daypick">
      <div class="day-label">오늘의 5문장<strong>Week ${week} · Day ${day}</strong></div>
      <button class="round-btn" id="prev-day" ${state.currentDay === 1 ? "disabled" : ""}>‹</button>
      <button class="round-btn" id="next-day" ${state.currentDay === TOTAL_DAYS ? "disabled" : ""}>›</button>
    </div>
    <section class="today-card">
      <div class="section-title">TODAY</div>
      <p class="note">Korean을 보고 English를 말한 뒤, Show Answer로 확인하세요.</p>
    </section>
    ${current.map(sentenceCard).join("")}
  `;
}

function unique(field) {
  return ["All", ...Array.from(new Set(cards.map((card) => card[field]).filter(Boolean))).sort()];
}

function filteredFlashCards() {
  return cards.filter((card) =>
    (state.selectedFilter.category === "All" || card.category === state.selectedFilter.category) &&
    (state.selectedFilter.use_case === "All" || card.use_case === state.selectedFilter.use_case) &&
    (state.selectedFilter.difficulty === "All" || card.difficulty === state.selectedFilter.difficulty)
  );
}

function chipRow(field, label) {
  return `<div class="section-title">${label}</div><div class="filter-row">${unique(field).map((value) => {
    const on = state.selectedFilter[field] === value;
    return `<button class="chip ${on ? "on" : ""}" data-filter-field="${field}" data-filter-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
  }).join("")}</div>`;
}

function renderCardsView() {
  const deck = filteredFlashCards();
  if (flashIndex >= deck.length) flashIndex = 0;
  const card = deck[flashIndex];
  document.getElementById("view-cards").innerHTML = `
    ${chipRow("category", "Category")}
    ${chipRow("use_case", "Use case")}
    ${chipRow("difficulty", "Difficulty")}
    ${card ? `<div class="counter">${flashIndex + 1} / ${deck.length}</div>
      <article class="flashcard" id="flashcard">
        <div class="flash-prompt">${flashFlipped ? "ANSWER" : "SAY THIS IN ENGLISH"}</div>
        ${flashFlipped ? `<div class="flash-en">${escapeHtml(card.english)}</div><div class="flash-sub">${escapeHtml(card.chunk)}<br>${escapeHtml(card.pattern)}</div>` : `<div class="flash-ko">${escapeHtml(card.korean)}</div>`}
        <div class="flash-sub">Tap card to flip</div>
      </article>
      <div class="judge-row">
        <button class="btn" id="prev-card">이전</button>
        <button class="btn" data-speak-card="${card.id}">🔊 발음</button>
        <button class="btn" id="next-card">다음</button>
      </div>
      ${stateButtons(card)}` : `<p class="note">선택한 필터에 해당하는 카드가 없습니다.</p>`}
  `;
}

const situationDefs = [
  { name: "Vendor scope clarification", category: "Vendor / CRO / External Communication", use_case: "Vendor" },
  { name: "Internal data review", category: "Data Interpretation", use_case: "Data Interpretation" },
  { name: "SPR/FACS result discussion", category: "SPR / FACS / ELISA", use_case: "Data Interpretation" },
  { name: "Candidate prioritization", category: "Antibody Discovery and Screening", use_case: "Meeting" },
  { name: "TCE strategy discussion", category: "TCE / Bispecific / Conditional Activation", use_case: "Presentation" },
  { name: "Presentation wording", category: "Internal Reporting / Presentation / Decision Making", use_case: "Presentation" },
  { name: "Risk and timeline alignment", category: "Internal Reporting / Presentation / Decision Making", use_case: "Meeting" }
];

function situationCards(def) {
  return cards.filter((card) => card.category === def.category || card.use_case === def.use_case);
}

function renderSituations() {
  const selected = selectedSituation ? situationDefs.find((item) => item.name === selectedSituation) : null;
  const list = selected ? situationCards(selected) : [];
  document.getElementById("view-situations").innerHTML = `
    <div class="section-title">업무 상황</div>
    ${situationDefs.map((item) => {
      const count = situationCards(item).length;
      return `<article class="situation-card" data-situation="${escapeHtml(item.name)}">
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.category)} · ${escapeHtml(item.use_case)} · ${count} cards</p>
      </article>`;
    }).join("")}
    ${selected ? `<div class="section-title">${escapeHtml(selected.name)}</div><div class="inline-list">${list.slice(0, 30).map(sentenceCard).join("")}</div>` : ""}
  `;
}

function renderRoadmap() {
  const weekTitles = Array.from(new Set(cards.map((card) => `${card.week}|${card.category}`))).map((item) => {
    const [week, category] = item.split("|");
    return { week: Number(week), category };
  });
  document.getElementById("view-roadmap").innerHTML = `
    <div class="section-title">6주 로드맵</div>
    ${weekTitles.map((weekInfo) => `<section class="week-block">
      <h3 class="week-title">Week ${weekInfo.week}</h3>
      <p class="week-sub">${escapeHtml(weekInfo.category)}</p>
      <div class="week-days">${Array.from({ length: 5 }, (_, index) => {
        const day = index + 1;
        const dayIndex = weekDayToIndex(weekInfo.week, day);
        const done = state.completedDays[String(dayIndex)];
        return `<button class="day-cell ${done ? "done" : ""}" data-go-day="${dayIndex}">${done ? "✓ " : ""}D${day}</button>`;
      }).join("")}</div>
    </section>`).join("")}
  `;
}

function renderPatterns() {
  const patterns = Array.from(new Set(cards.map((card) => card.pattern).filter(Boolean))).sort();
  const selectedCards = selectedPattern ? cards.filter((card) => card.pattern === selectedPattern) : [];
  document.getElementById("view-patterns").innerHTML = `
    <div class="section-title">표현 패턴</div>
    ${patterns.map((pattern) => `<article class="pattern-card" data-pattern="${escapeHtml(pattern)}">
      <strong>${escapeHtml(pattern)}</strong>
      <p class="flash-sub">${cards.filter((card) => card.pattern === pattern).length} cards</p>
    </article>`).join("")}
    ${selectedPattern ? `<div class="section-title">선택한 패턴</div>${selectedCards.map(sentenceCard).join("")}` : ""}
  `;
}

function render() {
  state.currentDay = clampDay(Number(state.currentDay) || 1);
  updateCompletedDays();
  saveState();
  renderDashboard();
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("on"));
  document.getElementById(`view-${state.activeView}`).classList.add("on");
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("on", button.dataset.view === state.activeView));
  renderToday();
  renderCardsView();
  renderSituations();
  renderRoadmap();
  renderPatterns();
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.onclick = () => { state.activeView = button.dataset.view; flashFlipped = false; saveState(); render(); };
  });
  const prevDay = document.getElementById("prev-day");
  const nextDay = document.getElementById("next-day");
  if (prevDay) prevDay.onclick = () => { state.currentDay = clampDay(state.currentDay - 1); render(); };
  if (nextDay) nextDay.onclick = () => { state.currentDay = clampDay(state.currentDay + 1); render(); };
  document.querySelectorAll("[data-toggle-answer]").forEach((button) => {
    button.onclick = () => {
      const target = document.getElementById(`answer-${button.dataset.toggleAnswer}`);
      target.classList.toggle("hidden");
      button.textContent = target.classList.contains("hidden") ? "Show Answer" : "Hide Answer";
    };
  });
  document.querySelectorAll("[data-speak-card]").forEach((button) => {
    button.onclick = () => {
      const card = cards.find((item) => item.id === button.dataset.speakCard);
      if (card) speak(card.english);
    };
  });
  document.querySelectorAll("[data-status-card]").forEach((button) => {
    button.onclick = () => setStatus(button.dataset.statusCard, button.dataset.statusValue);
  });
  document.querySelectorAll("[data-filter-field]").forEach((button) => {
    button.onclick = () => {
      state.selectedFilter[button.dataset.filterField] = button.dataset.filterValue;
      flashIndex = 0;
      flashFlipped = false;
      render();
    };
  });
  const flashcard = document.getElementById("flashcard");
  if (flashcard) flashcard.onclick = () => { flashFlipped = !flashFlipped; render(); };
  const prevCard = document.getElementById("prev-card");
  const nextCard = document.getElementById("next-card");
  if (prevCard) prevCard.onclick = () => { const deck = filteredFlashCards(); flashIndex = (flashIndex - 1 + deck.length) % deck.length; flashFlipped = false; render(); };
  if (nextCard) nextCard.onclick = () => { const deck = filteredFlashCards(); flashIndex = (flashIndex + 1) % deck.length; flashFlipped = false; render(); };
  document.querySelectorAll("[data-situation]").forEach((item) => {
    item.onclick = () => { selectedSituation = selectedSituation === item.dataset.situation ? null : item.dataset.situation; render(); };
  });
  document.querySelectorAll("[data-go-day]").forEach((item) => {
    item.onclick = () => { state.currentDay = Number(item.dataset.goDay); state.activeView = "today"; render(); };
  });
  document.querySelectorAll("[data-pattern]").forEach((item) => {
    item.onclick = () => { selectedPattern = selectedPattern === item.dataset.pattern ? null : item.dataset.pattern; render(); };
  });
}

async function init() {
  if ("speechSynthesis" in window) {
    voices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => { voices = window.speechSynthesis.getVoices(); };
  }
  const response = await fetch(`data/sentences.json?v=${DATA_VERSION}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load data/sentences.json");
  cards = await response.json();
  render();
}

init().catch((error) => {
  document.querySelector("main").innerHTML = `<p class="note">Loading failed: ${escapeHtml(error.message)}</p>`;
});
