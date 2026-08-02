const state = {
  sentences: [],
  current: "",
  tries: 0,
  playsLeft: 2,
  missed: [],
  voices: [],
};

const els = {
  sentenceCount: document.querySelector("#sentenceCount"),
  roundCount: document.querySelector("#roundCount"),
  newSentenceBtn: document.querySelector("#newSentenceBtn"),
  playBtn: document.querySelector("#playBtn"),
  playsLeft: document.querySelector("#playsLeft"),
  answerInput: document.querySelector("#answerInput"),
  checkBtn: document.querySelector("#checkBtn"),
  revealBtn: document.querySelector("#revealBtn"),
  result: document.querySelector("#result"),
  voiceSelect: document.querySelector("#voiceSelect"),
  randomVoiceToggle: document.querySelector("#randomVoiceToggle"),
  missedList: document.querySelector("#missedList"),
  clearReviewBtn: document.querySelector("#clearReviewBtn"),
};

async function loadSentences() {
  try {
    const response = await fetch(`sentences.txt?cache=${Date.now()}`);
    if (!response.ok) throw new Error("sentences.txt could not be loaded.");
    const text = await response.text();
    state.sentences = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    updateStats();
    pickNewSentence();
  } catch (error) {
    els.result.innerHTML = `<p class="result-line"><span class="wrong">sentences.txt를 불러오지 못했습니다.</span> GitHub Pages에 올린 뒤 접속하거나, 같은 폴더에서 간단한 로컬 서버로 열어주세요.</p>`;
    setPracticeEnabled(false);
  }
}

function setPracticeEnabled(enabled) {
  els.newSentenceBtn.disabled = !enabled;
  els.playBtn.disabled = !enabled;
  els.checkBtn.disabled = !enabled;
  els.revealBtn.disabled = !enabled;
  els.answerInput.disabled = !enabled;
}

function loadVoices() {
  const allVoices = window.speechSynthesis.getVoices();
  state.voices = allVoices.filter((voice) => /^en[-_]/i.test(voice.lang));
  if (state.voices.length === 0) state.voices = allVoices;

  els.voiceSelect.innerHTML = "";
  state.voices.forEach((voice, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${voice.name} (${voice.lang})`;
    els.voiceSelect.append(option);
  });
}

function getSelectedVoice() {
  if (state.voices.length === 0) return null;
  if (els.randomVoiceToggle.checked) {
    return state.voices[Math.floor(Math.random() * state.voices.length)];
  }
  return state.voices[Number(els.voiceSelect.value)] || state.voices[0];
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    els.result.innerHTML = `<p class="result-line"><span class="wrong">이 브라우저는 TTS를 지원하지 않습니다.</span></p>`;
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.88;
  utterance.pitch = 1;
  const voice = getSelectedVoice();
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

function pickNewSentence() {
  if (state.sentences.length === 0) {
    setPracticeEnabled(false);
    return;
  }

  const next = state.sentences[Math.floor(Math.random() * state.sentences.length)];
  state.current = next;
  state.playsLeft = 2;
  els.answerInput.value = "";
  els.result.innerHTML = "";
  els.answerInput.focus();
  updatePlayButton();
  speak(next);
}

function playAgain() {
  if (!state.current || state.playsLeft <= 0) return;
  state.playsLeft -= 1;
  updatePlayButton();
  speak(state.current);
}

function updatePlayButton() {
  els.playsLeft.textContent = `(${state.playsLeft} left)`;
  els.playBtn.disabled = state.playsLeft <= 0 || !state.current;
}

function normalizeForCompare(text) {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[.,!?;:"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeForCompare(text).split(" ").filter(Boolean);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function diffWords(answer, userInput) {
  const answerWords = tokenize(answer);
  const inputWords = tokenize(userInput);
  const rows = answerWords.length + 1;
  const cols = inputWords.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dp[i][j] = answerWords[i - 1] === inputWords[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  let i = answerWords.length;
  let j = inputWords.length;
  const answerMarked = [];
  const inputMarked = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && answerWords[i - 1] === inputWords[j - 1]) {
      answerMarked.unshift({ word: answerWords[i - 1], ok: true });
      inputMarked.unshift({ word: inputWords[j - 1], ok: true });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      inputMarked.unshift({ word: inputWords[j - 1], ok: false });
      j -= 1;
    } else {
      answerMarked.unshift({ word: answerWords[i - 1], ok: false });
      i -= 1;
    }
  }

  return {
    isCorrect: normalizeForCompare(answer) === normalizeForCompare(userInput),
    answerHtml: renderMarkedWords(answerMarked, "wrong"),
    inputHtml: renderMarkedWords(inputMarked, "wrong"),
  };
}

function renderMarkedWords(words, errorClass) {
  return words
    .map((item) => {
      const word = escapeHtml(item.word);
      return item.ok ? word : `<strong class="${errorClass}">${word}</strong>`;
    })
    .join(" ");
}

function checkAnswer() {
  if (!state.current) return;
  const input = els.answerInput.value.trim();
  const diff = diffWords(state.current, input);
  state.tries += 1;

  if (diff.isCorrect) {
    els.result.innerHTML = `<p class="result-line correct">Correct.</p>`;
  } else {
    els.result.innerHTML = `
      <p class="result-line"><span class="tag">Correct</span>${diff.answerHtml}</p>
      <p class="result-line"><span class="tag">Yours</span>${diff.inputHtml || '<strong class="wrong">(blank)</strong>'}</p>
    `;
    addMissed(state.current, input);
  }

  updateStats();
}

function revealAnswer() {
  if (!state.current) return;
  els.result.innerHTML = `<p class="result-line"><span class="tag">Answer</span>${escapeHtml(state.current)}</p>`;
}

function addMissed(answer, input) {
  state.missed.unshift({ answer, input });
  renderMissed();
}

function renderMissed() {
  els.missedList.innerHTML = "";
  if (state.missed.length === 0) {
    els.missedList.innerHTML = `<p class="empty">Missed sentences will appear here after you check an answer.</p>`;
    return;
  }

  state.missed.forEach((item, index) => {
    const diff = diffWords(item.answer, item.input);
    const card = document.createElement("article");
    card.className = "missed-item";
    card.innerHTML = `
      <p><span class="tag">Correct</span>${diff.answerHtml}</p>
      <p><span class="tag">Yours</span>${diff.inputHtml || '<strong class="wrong">(blank)</strong>'}</p>
      <button type="button" data-index="${index}">Listen</button>
    `;
    els.missedList.append(card);
  });
}

function clearReview() {
  state.missed = [];
  renderMissed();
}

function updateStats() {
  els.sentenceCount.textContent = `${state.sentences.length} sentences`;
  els.roundCount.textContent = `${state.tries} tried`;
}

els.newSentenceBtn.addEventListener("click", pickNewSentence);
els.playBtn.addEventListener("click", playAgain);
els.checkBtn.addEventListener("click", checkAnswer);
els.revealBtn.addEventListener("click", revealAnswer);
els.clearReviewBtn.addEventListener("click", clearReview);
els.missedList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-index]");
  if (!button) return;
  const item = state.missed[Number(button.dataset.index)];
  if (item) speak(item.answer);
});

window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
loadVoices();
loadSentences();
