/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/strict-boolean-expressions */
import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import { onDOMReady, qs, qsr } from "../utils/dom";
import * as Notifications from "../elements/notifications";
import { getAuthenticatedUser, isAuthenticated } from "../firebase";
import Ape from "../ape";
import * as PvPSocket from "../utils/pvp-socket";

// Sample word list for PvP
const WORD_LIST = [
  "the",
  "be",
  "to",
  "of",
  "and",
  "a",
  "in",
  "that",
  "have",
  "I",
  "it",
  "for",
  "not",
  "on",
  "with",
  "he",
  "as",
  "you",
  "do",
  "at",
  "this",
  "but",
  "his",
  "by",
  "from",
  "they",
  "we",
  "say",
  "her",
  "she",
  "or",
  "an",
  "will",
  "my",
  "one",
  "all",
  "would",
  "there",
  "their",
  "what",
  "so",
  "up",
  "out",
  "if",
  "about",
  "who",
  "get",
  "which",
  "go",
  "me",
  "when",
  "make",
  "can",
  "like",
  "time",
  "no",
  "just",
  "him",
  "know",
  "take",
  "people",
  "into",
  "year",
  "your",
  "good",
  "some",
  "could",
  "them",
  "see",
  "other",
  "than",
  "then",
  "now",
  "look",
  "only",
  "come",
  "its",
  "over",
  "think",
  "also",
  "back",
  "after",
  "use",
  "two",
  "how",
  "our",
  "work",
  "first",
  "well",
  "way",
  "even",
  "new",
  "want",
  "because",
  "any",
  "these",
  "give",
  "day",
  "most",
  "us",
  "very",
  "small",
  "run",
  "tell",
  "few",
  "those",
  "follow",
  "begin",
  "since",
  "would",
  "possible",
  "against",
  "through",
  "home",
  "stand",
  "take",
  "change",
  "much",
  "early",
  "ask",
];

type ViewState = "queue" | "match" | "result";

// PvP Test State
type PvPTestState = {
  words: string[];
  currentWordIndex: number;
  currentInput: string;
  correctChars: number;
  totalChars: number;
  errors: number;
  startTime: number | null;
  isActive: boolean;
};

const pvpTest: PvPTestState = {
  words: [],
  currentWordIndex: 0,
  currentInput: "",
  correctChars: 0,
  totalChars: 0,
  errors: 0,
  startTime: null,
  isActive: false,
};

type State = {
  view: ViewState;
  loading: boolean;
  inQueue: boolean;
  matchId: string | null;
  opponentName: string | null;
  countdown: number | null;
  ranking: {
    elo: number;
    wins: number;
    losses: number;
    matches: number;
  } | null;
  matchStats: {
    yourWpm: number;
    yourAccuracy: number;
    yourProgress: number;
    opponentWpm: number;
    opponentAccuracy: number;
    opponentProgress: number;
  } | null;
  result: {
    winner: string | null;
    yourWpm: number;
    yourAccuracy: number;
    yourEloChange: number;
    opponentWpm: number;
    opponentAccuracy: number;
    opponentEloChange: number;
  } | null;
};

const state: State = {
  view: "queue",
  loading: false,
  inQueue: false,
  matchId: null,
  opponentName: null,
  countdown: null,
  ranking: null,
  matchStats: null,
  result: null,
};

async function loadRanking(): Promise<void> {
  if (!isAuthenticated()) {
    return;
  }

  try {
    const user = getAuthenticatedUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const response = await (Ape as any).pvp.getRanking({
      params: { userId: user.uid },
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/strict-boolean-expressions
    if (response && response.status === 200 && response.body?.data) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const data = response.body.data;
      state.ranking = {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        elo: data.elo as number,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        wins: data.wins as number,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        losses: data.losses as number,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        matches: data.matches as number,
      };
      updateRankingDisplay();
    }
  } catch (error) {
    console.error("Failed to load ranking:", error);
    Notifications.add("Failed to load your ranking", -1);
  }
}

function updateRankingDisplay(): void {
  if (!state.ranking) return;

  const rankingEl = qs(".pagePvp .yourRanking");
  if (!rankingEl) return;

  const eloEl =
    rankingEl.native.querySelector<HTMLElement>('[data-stat="elo"]');
  const winsEl =
    rankingEl.native.querySelector<HTMLElement>('[data-stat="wins"]');
  const lossesEl = rankingEl.native.querySelector<HTMLElement>(
    '[data-stat="losses"]',
  );
  const winrateEl = rankingEl.native.querySelector<HTMLElement>(
    '[data-stat="winrate"]',
  );

  if (eloEl) eloEl.textContent = state.ranking.elo.toString();
  if (winsEl) winsEl.textContent = state.ranking.wins.toString();
  if (lossesEl) lossesEl.textContent = state.ranking.losses.toString();

  const winRate =
    state.ranking.matches > 0
      ? ((state.ranking.wins / state.ranking.matches) * 100).toFixed(1)
      : "0";
  if (winrateEl) winrateEl.textContent = `${winRate}%`;
}

async function joinQueue(): Promise<void> {
  console.log("joinQueue called");

  if (!isAuthenticated()) {
    console.error("Not authenticated");
    Notifications.add("Please sign in to play PvP", 0);
    return;
  }

  if (state.loading || state.inQueue) {
    console.log("Already loading or in queue", {
      loading: state.loading,
      inQueue: state.inQueue,
    });
    return;
  }

  state.loading = true;
  showLoading(true);

  try {
    console.log("Calling PvPSocket.joinQueue()");
    // Join queue via Socket.IO
    await PvPSocket.joinQueue();
    console.log("Successfully joined queue");
    state.inQueue = true;
    updateQueueView();
    Notifications.add("Joined queue. Searching for opponent...", 1);
  } catch (error) {
    console.error("Failed to join queue:", error);
    Notifications.add(
      `Failed to join queue: ${error instanceof Error ? error.message : "Unknown error"}`,
      -1,
    );
  } finally {
    state.loading = false;
    showLoading(false);
  }
}

async function leaveQueue(): Promise<void> {
  if (!state.inQueue) return;

  state.loading = true;
  showLoading(true);

  try {
    await PvPSocket.leaveQueue();
    state.inQueue = false;
    updateQueueView();
    Notifications.add("Left queue", 0);
  } catch (error) {
    console.error("Failed to leave queue:", error);
    Notifications.add("Failed to leave queue", -1);
  } finally {
    state.loading = false;
    showLoading(false);
  }
}

function updateQueueView(): void {
  const joinBtn = qs(".pagePvp .joinQueue");
  const leaveBtn = qs(".pagePvp .leaveQueue");
  const queueInfo = qs(".pagePvp .queueInfo");

  if (state.inQueue) {
    joinBtn?.addClass("hidden");
    leaveBtn?.removeClass("hidden");
    queueInfo?.removeClass("hidden");
  } else {
    joinBtn?.removeClass("hidden");
    leaveBtn?.addClass("hidden");
    queueInfo?.addClass("hidden");
  }
}

function updateQueueSize(size: number): void {
  const sizeEl = qs('.pagePvp [data-value="queueSize"]');
  sizeEl?.setText(size.toString());
}

function switchView(view: ViewState): void {
  state.view = view;

  const queueSection = qs(".pagePvp .queueSection");
  const matchSection = qs(".pagePvp .matchSection");
  const resultSection = qs(".pagePvp .resultSection");

  queueSection?.addClass("hidden");
  matchSection?.addClass("hidden");
  resultSection?.addClass("hidden");

  if (view === "queue") {
    queueSection?.removeClass("hidden");
  } else if (view === "match") {
    matchSection?.removeClass("hidden");
  } else if (view === "result") {
    resultSection?.removeClass("hidden");
  }
}

function handleMatchFound(data: { opponent: string; matchId: string }): void {
  state.matchId = data.matchId;
  state.opponentName = data.opponent;
  state.inQueue = false;

  Notifications.add(`Match found! vs ${data.opponent}`, 1, { duration: 3 });

  // Switch to match view
  switchView("match");
  updateMatchDisplay();

  // DEV: Auto-start game after short delay (remove in production)
  setTimeout(() => {
    console.log("DEV: Auto-starting game");
    handleGameStart();
  }, 1000);
}

function handleGameStart(): void {
  console.log("Match starting - beginning countdown");

  // Show countdown overlay
  const countdownOverlay = qs(".pagePvp .countdownOverlay");
  const countdownNumber = qs(".pagePvp .countdownNumber");

  if (countdownOverlay) {
    countdownOverlay.removeClass("hidden");
  }

  // Start countdown from 5
  state.countdown = 5;

  const countdownInterval = setInterval(() => {
    if (state.countdown === null || state.countdown <= 0) {
      clearInterval(countdownInterval);

      // Hide countdown overlay
      if (countdownOverlay) {
        countdownOverlay.addClass("hidden");
      }

      // Show GO! message
      Notifications.add("GO! Type as fast as you can!", 1, { duration: 2 });

      // Initialize test - typing is now enabled
      console.log("Countdown finished - initializing test");
      void initializePvPTest();

      return;
    }

    // Update countdown display
    if (countdownNumber) {
      if (state.countdown === 1) {
        countdownNumber.setText("GO!");
      } else {
        countdownNumber.setText(state.countdown.toString());
      }
    }

    console.log(`Countdown: ${state.countdown}`);
    state.countdown--;
  }, 1000);
}

async function initializePvPTest(): Promise<void> {
  try {
    console.log("Initializing PvP test...");

    // Reset test state
    pvpTest.words = generateWords(50);
    pvpTest.currentWordIndex = 0;
    pvpTest.currentInput = "";
    pvpTest.correctChars = 0;
    pvpTest.totalChars = 0;
    pvpTest.errors = 0;
    pvpTest.startTime = null;
    pvpTest.isActive = true;

    console.log("Generated words:", pvpTest.words.slice(0, 10));

    // Get elements
    const wordsContainer = document.querySelector(".pagePvp .pvpWords");
    const input = document.querySelector<HTMLInputElement>(
      ".pagePvp #pvpWordsInput",
    );
    const caret = document.querySelector<HTMLElement>(".pagePvp .pvpCaret");

    console.log("Elements found:", {
      wordsContainer: !!wordsContainer,
      input: !!input,
      caret: !!caret,
    });

    if (!wordsContainer || !input) {
      console.error("Required elements not found!");
      Notifications.add("Failed to initialize test area", -1);
      return;
    }

    // Render words
    renderWords();

    // Setup input handler
    input.value = "";

    // Remove old listeners first
    input.removeEventListener("input", handlePvPInput);
    input.removeEventListener("keydown", handlePvPKeydown);

    // Add new listeners
    input.addEventListener("input", handlePvPInput);
    input.addEventListener("keydown", handlePvPKeydown);

    // Focus input after a small delay to ensure DOM is ready
    setTimeout(() => {
      input.focus();
      console.log("Input focused, active element:", document.activeElement?.id);
    }, 100);

    // Update caret position
    updateCaret();

    console.log(
      "PvP test initialized successfully, words rendered:",
      pvpTest.words.length,
    );

    // Add click to focus on test area
    const testArea = document.querySelector<HTMLElement>(
      ".pagePvp .pvpTestArea",
    );
    if (testArea) {
      testArea.addEventListener("click", () => {
        const inp = document.querySelector<HTMLInputElement>(
          ".pagePvp #pvpWordsInput",
        );
        inp?.focus();
      });
    }
  } catch (error) {
    console.error("Failed to initialize PvP test:", error);
    Notifications.add("Failed to start typing test", -1);
  }
}

function generateWords(count: number): string[] {
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * WORD_LIST.length);
    words.push(WORD_LIST[randomIndex] as string);
  }
  return words;
}

function renderWords(): void {
  const wordsContainer = document.querySelector(".pagePvp .pvpWords");
  if (!wordsContainer) {
    console.error("Words container not found");
    return;
  }

  let html = "";

  pvpTest.words.forEach((word, wordIndex) => {
    const activeClass = wordIndex === pvpTest.currentWordIndex ? " active" : "";
    html += `<div class="word${activeClass}" data-wordindex="${wordIndex}">`;

    for (const char of word) {
      html += `<letter>${char}</letter>`;
    }

    html += "</div>";
  });

  wordsContainer.innerHTML = html;
  console.log("Words rendered, HTML length:", html.length);
}

function handlePvPInput(e: Event): void {
  if (!pvpTest.isActive) {
    return;
  }

  const input = e.target as HTMLInputElement;
  const inputValue = input.value;

  // Start timer on first input
  if (pvpTest.startTime === null && inputValue.length > 0) {
    pvpTest.startTime = Date.now();
  }

  pvpTest.currentInput = inputValue;
  updateWordDisplay();
  updateCaret();
  updateStats();
}

function handlePvPKeydown(e: KeyboardEvent): void {
  if (!pvpTest.isActive) {
    return;
  }

  if (e.key === " " || e.code === "Space") {
    e.preventDefault();

    const currentWord = pvpTest.words[pvpTest.currentWordIndex];
    if (!currentWord) {
      return;
    }

    // Count correct characters in this word
    let correctInWord = 0;
    const minLen = Math.min(pvpTest.currentInput.length, currentWord.length);
    for (let i = 0; i < minLen; i++) {
      if (pvpTest.currentInput[i] === currentWord[i]) {
        correctInWord++;
      }
    }

    // Only count as fully correct if exact match
    if (pvpTest.currentInput === currentWord) {
      pvpTest.correctChars += currentWord.length + 1; // +1 for space
    } else {
      // Partial credit for correct characters
      pvpTest.correctChars += correctInWord;
    }
    pvpTest.totalChars +=
      Math.max(pvpTest.currentInput.length, currentWord.length) + 1;

    // Mark current word as complete (add error class if incorrect)
    const activeWord = document.querySelector(
      ".pagePvp .pvpWords .word.active",
    );
    if (activeWord && pvpTest.currentInput !== currentWord) {
      activeWord.classList.add("error");
    }
    activeWord?.classList.remove("active");

    // Move to next word
    pvpTest.currentWordIndex++;
    pvpTest.currentInput = "";

    const input = e.target as HTMLInputElement;
    input.value = "";

    // Check if test is complete
    if (pvpTest.currentWordIndex >= pvpTest.words.length) {
      finishPvPTest();
      return;
    }

    // Mark next word as active
    const nextWord = document.querySelector(
      `.pagePvp .pvpWords .word[data-wordindex="${pvpTest.currentWordIndex}"]`,
    );
    nextWord?.classList.add("active");

    // Scroll words if needed
    scrollWords();

    updateCaret();
    updateStats();
  }
}

function scrollWords(): void {
  const wordsWrapper = document.querySelector<HTMLElement>(
    ".pagePvp .pvpWordsWrapper",
  );
  const activeWord = document.querySelector<HTMLElement>(
    ".pagePvp .pvpWords .word.active",
  );

  if (!wordsWrapper || !activeWord) {
    return;
  }

  const wrapperRect = wordsWrapper.getBoundingClientRect();
  const wordRect = activeWord.getBoundingClientRect();

  // If word is below the visible area, scroll
  if (wordRect.top > wrapperRect.top + wrapperRect.height * 0.5) {
    const pvpWords = document.querySelector<HTMLElement>(".pagePvp .pvpWords");
    if (pvpWords) {
      const currentMargin = parseInt(pvpWords.style.marginTop || "0", 10);
      const lineHeight = wordRect.height + 8; // approximate line height
      pvpWords.style.marginTop = `${currentMargin - lineHeight}px`;
    }
  }
}

function updateWordDisplay(): void {
  const activeWord = document.querySelector(".pagePvp .pvpWords .word.active");
  if (!activeWord) {
    console.warn("Active word not found");
    return;
  }

  const currentWord = pvpTest.words[pvpTest.currentWordIndex];
  if (!currentWord) {
    return;
  }

  // Rebuild the word HTML with correct/incorrect classes
  let html = "";
  const input = pvpTest.currentInput;
  const chars = currentWord.split("");

  for (let i = 0; i < chars.length; i++) {
    let className = "";
    if (i < input.length) {
      className = input[i] === chars[i] ? "correct" : "incorrect";
    }
    html += `<letter${className ? ` class="${className}"` : ""}>${chars[i]}</letter>`;
  }

  // Add extra characters
  if (input.length > currentWord.length) {
    for (let i = currentWord.length; i < input.length; i++) {
      html += `<letter class="incorrect extra">${input[i]}</letter>`;
    }
  }

  activeWord.innerHTML = html;
}

function updateCaret(): void {
  const caret = document.querySelector<HTMLElement>(".pagePvp .pvpCaret");
  const wordsWrapper = document.querySelector<HTMLElement>(
    ".pagePvp .pvpWordsWrapper",
  );
  const activeWord = document.querySelector(".pagePvp .pvpWords .word.active");

  if (!caret || !wordsWrapper || !activeWord) {
    console.warn("Caret elements not found:", {
      caret: !!caret,
      wordsWrapper: !!wordsWrapper,
      activeWord: !!activeWord,
    });
    return;
  }

  const letters = activeWord.querySelectorAll("letter");
  const inputLen = pvpTest.currentInput.length;
  const wrapperRect = wordsWrapper.getBoundingClientRect();

  let targetRect: DOMRect | null = null;
  let useRightEdge = false;

  const firstLetter = letters[0];
  if (inputLen === 0 && firstLetter) {
    // Position at start of first letter
    targetRect = firstLetter.getBoundingClientRect();
    useRightEdge = false;
  } else if (inputLen > 0 && inputLen <= letters.length) {
    const targetLetter = letters[inputLen - 1];
    if (targetLetter) {
      // Position after the last typed letter
      targetRect = targetLetter.getBoundingClientRect();
      useRightEdge = true;
    }
  } else if (letters.length > 0) {
    // Position after last letter (for extra chars)
    const lastLetter = letters[letters.length - 1];
    if (lastLetter) {
      targetRect = lastLetter.getBoundingClientRect();
      useRightEdge = true;
    }
  }

  if (targetRect) {
    const left = useRightEdge
      ? targetRect.right - wrapperRect.left
      : targetRect.left - wrapperRect.left;
    const top = targetRect.top - wrapperRect.top;

    caret.style.left = `${left}px`;
    caret.style.top = `${top}px`;
  }
}

function updateStats(): void {
  if (!pvpTest.startTime) {
    return;
  }

  const elapsed = (Date.now() - pvpTest.startTime) / 1000 / 60; // minutes
  const wpm = elapsed > 0 ? Math.round(pvpTest.correctChars / 5 / elapsed) : 0;
  const accuracy =
    pvpTest.totalChars > 0
      ? Math.round((pvpTest.correctChars / pvpTest.totalChars) * 100)
      : 100;

  // Update local display
  state.matchStats ??= {
    yourWpm: 0,
    yourAccuracy: 0,
    yourProgress: 0,
    opponentWpm: 0,
    opponentAccuracy: 0,
    opponentProgress: 0,
  };
  state.matchStats.yourWpm = wpm;
  state.matchStats.yourAccuracy = accuracy;
  state.matchStats.yourProgress = Math.round(
    (pvpTest.currentWordIndex / pvpTest.words.length) * 100,
  );

  updateMatchDisplay();

  // Send progress to opponent
  PvPSocket.emit("pvp:progress", {
    wpm,
    accuracy,
    progress: state.matchStats.yourProgress,
  });
}

function finishPvPTest(): void {
  pvpTest.isActive = false;

  const input = document.querySelector<HTMLInputElement>("#pvpWordsInput");
  if (input) {
    input.removeEventListener("input", handlePvPInput);
    input.removeEventListener("keydown", handlePvPKeydown);
  }

  // Send completion to server
  PvPSocket.emit("pvp:complete", {
    wpm: state.matchStats?.yourWpm ?? 0,
    accuracy: state.matchStats?.yourAccuracy ?? 0,
  });
}

function handleOpponentProgress(data: {
  wpm: number;
  accuracy: number;
  timestamp: number;
}): void {
  state.matchStats ??= {
    yourWpm: 0,
    yourAccuracy: 0,
    yourProgress: 0,
    opponentWpm: 0,
    opponentAccuracy: 0,
    opponentProgress: 0,
  };

  state.matchStats.opponentWpm = data.wpm;
  state.matchStats.opponentAccuracy = data.accuracy;
  // progress is not sent, keep existing value

  updateMatchDisplay();
}

function handleMatchResult(data: {
  winner: string;
  yourStats: { wpm: number; accuracy: number; eloChange: number };
  opponentStats: { wpm: number; accuracy: number; eloChange: number };
}): void {
  state.result = {
    winner: data.winner,
    yourWpm: data.yourStats.wpm,
    yourAccuracy: data.yourStats.accuracy,
    yourEloChange: data.yourStats.eloChange,
    opponentWpm: data.opponentStats.wpm,
    opponentAccuracy: data.opponentStats.accuracy,
    opponentEloChange: data.opponentStats.eloChange,
  };

  switchView("result");
  updateResultDisplay();

  const user = getAuthenticatedUser();
  const userName =
    user?.displayName !== null &&
    user?.displayName !== undefined &&
    user.displayName.length > 0
      ? user.displayName
      : user?.email !== null &&
          user?.email !== undefined &&
          user.email.length > 0
        ? user.email
        : (user?.uid ?? "");
  const isWinner = data.winner === userName;
  Notifications.add(
    isWinner ? "You won! 🎉" : "You lost. Better luck next time!",
    isWinner ? 1 : 0,
    { duration: 5 },
  );

  // Reload ranking
  void loadRanking();
}

function updateMatchDisplay(): void {
  if (!state.matchStats) return;

  const youSection = qs(".pagePvp .matchStats .playerCard.you");
  const opponentSection = qs(".pagePvp .matchStats .playerCard.opponent");

  // Update your stats
  const yourWpmEl =
    youSection?.native.querySelector<HTMLElement>('[data-stat="wpm"]');
  const yourAccEl = youSection?.native.querySelector<HTMLElement>(
    '[data-stat="accuracy"]',
  );
  const yourProgEl = youSection?.native.querySelector<HTMLElement>(
    '[data-stat="progress"]',
  );

  if (yourWpmEl) {
    yourWpmEl.textContent = Math.round(state.matchStats.yourWpm).toString();
  }
  if (yourAccEl) {
    yourAccEl.textContent = `${Math.round(state.matchStats.yourAccuracy)}%`;
  }
  if (yourProgEl) {
    yourProgEl.textContent = `${Math.round(state.matchStats.yourProgress)}%`;
  }

  // Update opponent stats
  const oppWpmEl =
    opponentSection?.native.querySelector<HTMLElement>('[data-stat="wpm"]');
  const oppAccEl = opponentSection?.native.querySelector<HTMLElement>(
    '[data-stat="accuracy"]',
  );
  const oppProgEl = opponentSection?.native.querySelector<HTMLElement>(
    '[data-stat="progress"]',
  );

  if (oppWpmEl) {
    oppWpmEl.textContent = Math.round(state.matchStats.opponentWpm).toString();
  }
  if (oppAccEl) {
    oppAccEl.textContent = `${Math.round(state.matchStats.opponentAccuracy)}%`;
  }
  if (oppProgEl) {
    oppProgEl.textContent = `${Math.round(state.matchStats.opponentProgress)}%`;
  }

  // Update opponent name in VS section
  const opponentNameEl = qs(".pagePvp .matchStats .vsSection .opponentName");
  opponentNameEl?.setText(state.opponentName ?? "Opponent");

  // Also update opponent name in their card
  const oppCardName = qs(
    ".pagePvp .matchStats .playerCard.opponent .playerName",
  );
  oppCardName?.setText(state.opponentName ?? "Opponent");
}

function updateResultDisplay(): void {
  if (!state.result) return;

  const user = getAuthenticatedUser();
  const userName =
    user?.displayName !== null &&
    user?.displayName !== undefined &&
    user.displayName.length > 0
      ? user.displayName
      : user?.email !== null &&
          user?.email !== undefined &&
          user.email.length > 0
        ? user.email
        : (user?.uid ?? "");
  const isWinner = state.result.winner === userName;

  // Update title
  const titleEl = qs(".pagePvp .resultSection .matchResult");
  titleEl?.setText(isWinner ? "Victory!" : "Defeat");
  titleEl?.removeClass(["winner", "loser"]);
  titleEl?.addClass(isWinner ? "winner" : "loser");

  // Update subtitle
  const subtextEl = qs(".pagePvp .resultSection .resultSubtext");
  subtextEl?.setText(
    `${isWinner ? "You defeated" : "You were defeated by"} ${state.opponentName}`,
  );

  // Update your stats
  const youSection = qs(".pagePvp .resultContent .playerResult.you");
  const yourWpmEl =
    youSection?.native.querySelector<HTMLElement>('[data-stat="wpm"]');
  const yourAccEl = youSection?.native.querySelector<HTMLElement>(
    '[data-stat="accuracy"]',
  );
  const yourEloEl = youSection?.native.querySelector<HTMLElement>(
    '[data-stat="eloChange"]',
  );

  if (yourWpmEl) {
    yourWpmEl.textContent = state.result.yourWpm.toFixed(2);
  }
  if (yourAccEl) {
    yourAccEl.textContent = `${state.result.yourAccuracy.toFixed(2)}%`;
  }

  const yourEloChange = state.result.yourEloChange;
  if (yourEloEl) {
    yourEloEl.textContent = `${yourEloChange > 0 ? "+" : ""}${yourEloChange.toFixed(0)}`;
    yourEloEl.classList.remove("positive", "negative");
    yourEloEl.classList.add(yourEloChange > 0 ? "positive" : "negative");
  }

  // Update opponent stats
  const opponentSection = qs(".pagePvp .resultContent .playerResult.opponent");
  const oppWpmEl =
    opponentSection?.native.querySelector<HTMLElement>('[data-stat="wpm"]');
  const oppAccEl = opponentSection?.native.querySelector<HTMLElement>(
    '[data-stat="accuracy"]',
  );
  const oppEloEl = opponentSection?.native.querySelector<HTMLElement>(
    '[data-stat="eloChange"]',
  );

  if (oppWpmEl) {
    oppWpmEl.textContent = state.result.opponentWpm.toFixed(2);
  }
  if (oppAccEl) {
    oppAccEl.textContent = `${state.result.opponentAccuracy.toFixed(2)}%`;
  }

  const oppEloChange = state.result.opponentEloChange;
  if (oppEloEl) {
    oppEloEl.textContent = `${oppEloChange > 0 ? "+" : ""}${oppEloChange.toFixed(0)}`;
    oppEloEl.classList.remove("positive", "negative");
    oppEloEl.classList.add(oppEloChange > 0 ? "positive" : "negative");
  }

  // Update opponent name
  const opponentNameEl = qs(".pagePvp .opponentName");
  opponentNameEl?.setText(state.opponentName ?? "Opponent");
}

function showLoading(show: boolean): void {
  const loadingEl = qs(".pagePvp .loading");
  if (show) {
    loadingEl?.removeClass("hidden");
  } else {
    loadingEl?.addClass("hidden");
  }
}

function showError(message: string): void {
  const errorEl = qs(".pagePvp .error");
  const messageEl = errorEl?.native.querySelector<HTMLElement>(".errorMessage");
  if (messageEl) messageEl.textContent = message;
  errorEl?.removeClass("hidden");

  setTimeout(() => {
    errorEl?.addClass("hidden");
  }, 5000);
}

async function forfeit(): Promise<void> {
  if (state.matchId === null) return;

  const confirmed = confirm("Are you sure you want to forfeit this match?");
  if (!confirmed) return;

  try {
    await PvPSocket.forfeit();
    Notifications.add("You forfeited the match", 0);
    switchView("queue");
    resetState();
  } catch (error) {
    console.error("Failed to forfeit:", error);
    Notifications.add("Failed to forfeit match", -1);
  }
}

function resetState(): void {
  state.matchId = null;
  state.opponentName = null;
  state.matchStats = null;
  state.result = null;
  state.inQueue = false;
  state.countdown = null;
}

function setupSocketListeners(): void {
  // Queue events
  PvPSocket.on("pvp:queue_joined", (data: { queueSize: number }) => {
    updateQueueSize(data.queueSize);
  });

  PvPSocket.on("pvp:queue_status", (data: { queueSize: number }) => {
    updateQueueSize(data.queueSize);
  });

  PvPSocket.on("pvp:match_found", handleMatchFound);

  // Match events
  PvPSocket.on("pvp:game_start", handleGameStart);

  PvPSocket.on("pvp:opponent_progress", handleOpponentProgress);

  PvPSocket.on("pvp:match_result", handleMatchResult);

  PvPSocket.on("pvp:opponent_disconnected", () => {
    Notifications.add("Opponent disconnected. You win by default!", 1);
  });

  PvPSocket.on("pvp:error", (data: { message: string }) => {
    showError(data.message);
    Notifications.add(data.message, -1);
  });
}

// Event handlers
onDOMReady(() => {
  console.log("PvP page: DOM ready, attaching event handlers");

  // Save skeleton
  Skeleton.save("pagePvp");

  // Join queue button
  const joinBtn = qs(".pagePvp .joinQueue");
  console.log("Join queue button found:", joinBtn);

  joinBtn?.on("click", () => {
    console.log("Join queue button clicked!");
    void joinQueue();
  });

  // Leave queue button
  qs(".pagePvp .leaveQueue")?.on("click", () => {
    console.log("Leave queue button clicked!");
    void leaveQueue();
  });

  // Dev: Test match button (simulates finding a match)
  qs(".pagePvp .testMatch")?.on("click", () => {
    console.log("DEV: Test match clicked - simulating match found");
    handleMatchFound({ opponent: "TestBot", matchId: "test-match-123" });
  });

  // Forfeit button
  qs(".pagePvp .forfeit")?.on("click", () => {
    void forfeit();
  });

  // Dev: Start test button
  qs(".pagePvp .startTest")?.on("click", () => {
    console.log("DEV: Manual start test clicked");
    handleGameStart();
  });

  // Result actions
  qs(".pagePvp .playAgain")?.on("click", () => {
    resetState();
    switchView("queue");
    void joinQueue();
  });

  qs(".pagePvp .backToQueue")?.on("click", () => {
    resetState();
    switchView("queue");
  });

  qs(".pagePvp .viewLeaderboard")?.on("click", () => {
    // Navigate to leaderboards
    window.location.href = "/leaderboards";
  });
});

export const page = new Page({
  id: "pvp",
  element: qsr(".page.pagePvp"),
  path: "/pvp",
  beforeShow: async (): Promise<void> => {
    console.log("PvP page beforeShow");
    Skeleton.append("pagePvp", "main");

    // Attach event handlers (do this after skeleton is appended)
    const joinBtn = qs(".pagePvp .joinQueue");
    const leaveBtn = qs(".pagePvp .leaveQueue");
    const forfeitBtn = qs(".pagePvp .forfeit");
    const testMatchBtn = qs(".pagePvp .testMatch");

    console.log("Attaching handlers, buttons found:", {
      joinBtn: !!joinBtn,
      leaveBtn: !!leaveBtn,
      forfeitBtn: !!forfeitBtn,
      testMatchBtn: !!testMatchBtn,
    });

    // Attach handlers
    joinBtn?.on("click", () => {
      console.log("Join queue button clicked!");
      void joinQueue();
    });

    leaveBtn?.on("click", () => {
      console.log("Leave queue button clicked!");
      void leaveQueue();
    });

    // Dev: Test match button
    testMatchBtn?.on("click", () => {
      console.log("DEV: Test match clicked - simulating match found");
      handleMatchFound({ opponent: "TestBot", matchId: "test-match-123" });
    });

    forfeitBtn?.on("click", () => {
      console.log("Forfeit button clicked!");
      void forfeit();
    });

    // Dev: Start test button
    const startTestBtn = qs(".pagePvp .startTest");
    startTestBtn?.on("click", () => {
      console.log("DEV: Manual start test clicked");
      handleGameStart();
    });

    // Initialize Socket.IO connection
    PvPSocket.connect();
    setupSocketListeners();

    // Load ranking
    await loadRanking();

    // Reset to queue view
    switchView("queue");
    updateQueueView();
  },
  afterHide: async (): Promise<void> => {
    // Move typing test back to test page
    const typingTest = qs("#typingTest");
    const testPage = qs(".pageTest");

    if (typingTest && testPage) {
      testPage.native.appendChild(typingTest.native);
    }

    // Disconnect Socket.IO
    PvPSocket.disconnect();

    // Clean up state
    if (state.inQueue) {
      await leaveQueue();
    }

    resetState();
    Skeleton.remove("pagePvp");
  },
});
