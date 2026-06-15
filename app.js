const TOTAL_DAYS = 56;
const DAYS_PER_WEEK = 7;
const STORAGE_KEY = "workEnglishStudyProgress.v1";

let cards = [];
let currentDayIndex = Number(localStorage.getItem("workEnglishStudyDay") || "1");

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

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
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
      <button class="answer-button" type="button" data-answer-button="${escapeHtml(card.id)}">Show Answer</button>
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
        ${badge(card.category)}
        ${badge(card.difficulty)}
        ${badge(card.use_case)}
      </div>
      <div class="progress-row">
        <span>Progress</span>
        <select data-progress-select="${escapeHtml(card.id)}">
          ${["Not studied", "Studied", "Need review", "Mastered"].map((option) => (
            `<option value="${option}" ${option === status ? "selected" : ""}>${option}</option>`
          )).join("")}
        </select>
      </div>
    </article>
  `;
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
  const studied = values.filter((value) => value === "Studied").length;
  const needReview = values.filter((value) => value === "Need review").length;
  const mastered = values.filter((value) => value === "Mastered").length;
  document.getElementById("studied-count").textContent = `Studied: ${studied}`;
  document.getElementById("review-count").textContent = `Need review: ${needReview}`;
  document.getElementById("mastered-count").textContent = `Mastered: ${mastered}`;
  document.getElementById("total-progress").textContent = `${mastered} / ${cards.length} mastered`;
}

function bindCardEvents() {
  document.querySelectorAll("[data-answer-button]").forEach((button) => {
    button.addEventListener("click", () => {
      const cardId = button.getAttribute("data-answer-button");
      const answer = document.getElementById(`answer-${cardId}`);
      const isHidden = answer.classList.toggle("hidden");
      button.textContent = isHidden ? "Show Answer" : "Hide Answer";
    });
  });

  document.querySelectorAll("[data-progress-select]").forEach((select) => {
    select.addEventListener("change", () => {
      setStatus(select.getAttribute("data-progress-select"), select.value);
    });
  });
}

function render() {
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

  bindCardEvents();
  updateSummary();
}

async function init() {
  currentDayIndex = clampDay(currentDayIndex);
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

init().catch((error) => {
  document.getElementById("cards").innerHTML =
    `<article class="card"><strong>Failed to load study data.</strong><p>${escapeHtml(error.message)}</p></article>`;
});
