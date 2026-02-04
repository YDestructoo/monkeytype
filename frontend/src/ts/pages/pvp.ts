/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/strict-boolean-expressions */
import Page from "./page";
import * as Skeleton from "../utils/skeleton";
import { onDOMReady, qs, qsr } from "../utils/dom";
import * as Notifications from "../elements/notifications";
import { getAuthenticatedUser, isAuthenticated } from "../firebase";
import Ape from "../ape";
import * as PvPSocket from "../utils/pvp-socket";

type ViewState = "queue" | "match" | "result";

type State = {
  view: ViewState;
  loading: boolean;
  inQueue: boolean;
  matchId: string | null;
  opponentName: string | null;
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
}

function handleGameStart(): void {
  Notifications.add("Match started! Type as fast as you can!", 1, {
    duration: 2,
  });
  // Initialize test UI here
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

  const youSection = qs(".pagePvp .matchContent .playerStats.you");
  const opponentSection = qs(".pagePvp .matchContent .playerStats.opponent");

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

  // Update opponent name
  const opponentNameEl = qs(".pagePvp .opponentName");
  opponentNameEl?.setText(state.opponentName ?? "Opponent");
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

  // Forfeit button
  qs(".pagePvp .forfeit")?.on("click", () => {
    void forfeit();
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

    console.log("Attaching handlers, buttons found:", {
      joinBtn: !!joinBtn,
      leaveBtn: !!leaveBtn,
      forfeitBtn: !!forfeitBtn,
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

    forfeitBtn?.on("click", () => {
      console.log("Forfeit button clicked!");
      void forfeit();
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
