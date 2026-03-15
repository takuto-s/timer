// 状態定義
const STATES = [
  { id: "empty", label: "空" },
  { id: "order-wait", label: "オーダー待ち" },
  { id: "eating", label: "食事中" },
  { id: "after-wait", label: "アフター待ち" },
  { id: "after-done", label: "アフター完了" },
  { id: "bill-wait", label: "会計待ち" },
  { id: "reset", label: "再セット" },
];

// 卓配置（90°CCW回転後）: [col, row] (0-indexed)
const TABLE_POSITIONS = {
  C3: [2, 0],
  C2: [3, 0],
  C1: [4, 0],
  C4: [0, 2],
  C5: [0, 3],
  E4: [2, 2],
  E3: [3, 2],
  E5: [2, 3],
  E2: [3, 3],
  E6: [2, 4],
  E1: [3, 4],
  B3: [5, 2],
  B2: [6, 2],
  B4: [5, 3],
  B1: [6, 3],
  A4: [4, 5],
  A3: [5, 5],
  A2: [6, 5],
  A1: [7, 5],
  F2: [0, 5],
  F1: [1, 5],
};

const TABLE_NAMES = Object.keys(TABLE_POSITIONS);
const GRID_COLS = 8;
const GRID_ROWS = 6;

// 状態管理
let tables = {};

// 長押し検出
const LONG_PRESS_DELAY = 67;    // 何もしない時間(ms)
const LONG_PRESS_RING_MS = 266; // リング表示時間(ms)
let longPressTimer = null;
let longPressActive = false;
let longPressRingEl = null;
let longPressCellEl = null;
let longPressSourceTable = null;
let longPressGhostEl = null;
let longPressDragged = false;

function createGhost(sourceCell, x, y) {
  longPressDragged = true;
  removeGhost();
  const ghost = sourceCell.cloneNode(true);
  ghost.classList.add("long-press-ghost");
  ghost.classList.remove("long-press-active");
  const rect = sourceCell.getBoundingClientRect();
  ghost.style.width = rect.width + "px";
  ghost.style.height = rect.height + "px";
  ghost.style.left = (x - rect.width / 2) + "px";
  ghost.style.top = (y - rect.height / 2) + "px";
  document.body.appendChild(ghost);
  longPressGhostEl = ghost;
}

function updateGhost(x, y) {
  if (!longPressGhostEl) return;
  longPressGhostEl.style.left = (x - longPressGhostEl.offsetWidth / 2) + "px";
  longPressGhostEl.style.top = (y - longPressGhostEl.offsetHeight / 2) + "px";
}

function removeGhost() {
  if (longPressGhostEl) {
    longPressGhostEl.remove();
    longPressGhostEl = null;
  }
}

function removeLongPressRingEl() {
  if (longPressRingEl) {
    longPressRingEl.remove();
    longPressRingEl = null;
  }
}

function removeLongPressRing() {
  removeLongPressRingEl();
  if (longPressCellEl) {
    longPressCellEl.classList.remove("long-press-active");
    longPressCellEl = null;
  }
}

function commitAndRender() {
  saveTables();
  renderFloorMap();
  renderLOList();
}

function copyTableState(sourceName, targetName) {
  Object.assign(tables[targetName], tables[sourceName]);
  commitAndRender();
}

function defaultTableState() {
  return { state: "empty", food: null, drink: null, loTime: null, stateStartTime: null, birthday: false, allergy: false };
}

function initTables() {
  const saved = localStorage.getItem("yakiniku-tables");
  if (saved) {
    tables = JSON.parse(saved);
    TABLE_NAMES.forEach((name) => {
      if (!tables[name]) tables[name] = defaultTableState();
    });
  } else {
    TABLE_NAMES.forEach((name) => {
      tables[name] = defaultTableState();
    });
  }
}

function saveTables() {
  localStorage.setItem("yakiniku-tables", JSON.stringify(tables));
}

// フロアマップ描画
function renderFloorMap() {
  const map = document.getElementById("floor-map");
  map.innerHTML = "";

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const tableName = TABLE_NAMES.find(
        (name) =>
          TABLE_POSITIONS[name][0] === c && TABLE_POSITIONS[name][1] === r,
      );

      const cell = document.createElement("div");

      if (tableName) {
        const table = tables[tableName];
        cell.className = `table-cell state-${table.state}`;
        cell.style.gridColumn = c + 1;
        cell.style.gridRow = r + 1;
        cell.dataset.tableName = tableName;

        const nameEl = document.createElement("div");
        nameEl.className = "table-name";
        nameEl.textContent = tableName;
        cell.appendChild(nameEl);

        const statusEl = document.createElement("div");
        statusEl.className = "table-status";
        const stateObj = STATES.find((s) => s.id === table.state);
        statusEl.textContent = stateObj ? stateObj.label : "";
        cell.appendChild(statusEl);

        // 食事中の場合、フード/ドリンク情報 + 残り時間を表示
        if (table.state === "eating") {
          const mealEl = document.createElement("div");
          mealEl.className = "table-meal-type";
          const foodLabel = table.food === "unlimited" ? "F:放題" : "F:単品";
          const drinkLabel = table.drink === "unlimited" ? "D:放題" : "D:単品";
          mealEl.textContent = `${foodLabel} ${drinkLabel}`;
          cell.appendChild(mealEl);
          if (table.loTime) {
            const timerEl = document.createElement("div");
            timerEl.className = "table-timer";
            const remainMs = table.loTime - Date.now();
            const remainMin = Math.max(0, Math.ceil(remainMs / 60000));
            timerEl.textContent = `残${remainMin}分`;
            cell.appendChild(timerEl);
          }
        }

        // オーダー待ち・アフター完了の経過時間表示
        if (
          (table.state === "order-wait" || table.state === "after-done") &&
          table.stateStartTime
        ) {
          const timerEl = document.createElement("div");
          timerEl.className = "table-timer";
          timerEl.textContent = formatElapsed(
            Date.now() - table.stateStartTime,
          );
          cell.appendChild(timerEl);
        }

        // 備考バッジ表示
        if (table.birthday || table.allergy) {
          const notesEl = document.createElement("div");
          notesEl.className = "table-notes";
          if (table.birthday) notesEl.textContent += "🎂";
          if (table.allergy) notesEl.textContent += "⚠";
          cell.appendChild(notesEl);
        }

        const handleRelease = (clientX, clientY) => {
          removeGhost();
          removeLongPressRing();
          const src = longPressSourceTable;
          longPressSourceTable = null;
          // longPressActive はここでは false にしない（直後の click をブロックするため）
          const el = document.elementFromPoint(clientX, clientY);
          const targetCellEl = el?.closest("[data-table-name]");
          const targetName = targetCellEl?.dataset.tableName;
          const canCopy = tables[targetName]?.state === "eating";
          if (canCopy && targetName !== src) {
            copyTableState(targetName, src);
          } else if (!longPressDragged) {
            openEditModal(src);
          }
          longPressDragged = false;
        };

        const startLongPress = () => {
          longPressDragged = false;
          longPressActive = false;
          longPressSourceTable = null;
          longPressCellEl = cell;
          cell.classList.add("long-press-active");
          longPressTimer = setTimeout(() => {
            // 200ms経過後、リング表示開始
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "0 0 40 40");
            svg.classList.add("long-press-ring");
            const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            track.setAttribute("cx", "20");
            track.setAttribute("cy", "20");
            track.setAttribute("r", "16");
            track.setAttribute("fill", "none");
            track.setAttribute("stroke", "rgba(255,255,255,0.25)");
            track.setAttribute("stroke-width", "5");
            svg.appendChild(track);
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", "20");
            circle.setAttribute("cy", "20");
            circle.setAttribute("r", "16");
            circle.setAttribute("fill", "none");
            circle.setAttribute("stroke", "rgba(255,255,255,0.95)");
            circle.setAttribute("stroke-width", "5");
            circle.setAttribute("stroke-linecap", "round");
            circle.setAttribute("stroke-dasharray", "100.53");
            circle.setAttribute("stroke-dashoffset", "100.53");
            circle.style.animation = `longPressRing ${LONG_PRESS_RING_MS}ms linear forwards`;
            svg.appendChild(circle);
            cell.appendChild(svg);
            longPressRingEl = svg;
            longPressTimer = setTimeout(() => {
              // リングだけ消す（オーバーレイは残す）
              removeLongPressRingEl();
              longPressActive = true;
              longPressSourceTable = tableName;
              // 離した場所で判定するためここでは何もしない
            }, LONG_PRESS_RING_MS);
          }, LONG_PRESS_DELAY);
        };

        cell.addEventListener("touchstart", startLongPress, { passive: true });
        cell.addEventListener("touchend", (e) => {
          clearTimeout(longPressTimer);
          if (longPressActive) {
            const touch = e.changedTouches[0];
            handleRelease(touch.clientX, touch.clientY);
          } else {
            removeLongPressRing();
          }
        });
        cell.addEventListener("touchmove", (e) => {
          if (!longPressActive) {
            clearTimeout(longPressTimer);
            removeLongPressRing();
          } else {
            longPressDragged = true;
            const touch = e.touches[0];
            const x = touch.clientX, y = touch.clientY;
            const over = document.elementFromPoint(x, y)?.closest("[data-table-name]")?.dataset.tableName;
            if (over && over !== longPressSourceTable && tables[over]?.state === "eating") {
              if (!longPressGhostEl) createGhost(longPressCellEl, x, y);
              else updateGhost(x, y);
            } else {
              removeGhost();
            }
          }
        }, { passive: true });
        cell.addEventListener("mousedown", startLongPress);
        cell.addEventListener("mouseup", (e) => {
          clearTimeout(longPressTimer);
          if (longPressActive) {
            handleRelease(e.clientX, e.clientY);
          } else {
            removeLongPressRing();
          }
        });
        cell.addEventListener("mouseleave", () => {
          if (!longPressActive) {
            clearTimeout(longPressTimer);
            removeLongPressRing();
          } else {
            longPressDragged = true;
          }
        });
        cell.addEventListener("mouseenter", () => {
          if (longPressActive && cell.dataset.tableName === longPressSourceTable) {
            removeGhost();
          }
        });
        cell.addEventListener("click", () => {
          if (longPressActive) return;
          onTableClick(tableName);
        });
      } else {
        cell.className = "empty-cell";
        cell.style.gridColumn = c + 1;
        cell.style.gridRow = r + 1;
      }

      map.appendChild(cell);
    }
  }
}

// LOリスト描画
function renderLOList() {
  const container = document.getElementById("lo-items");
  container.innerHTML = "";

  const activeTables = TABLE_NAMES.filter(
    (name) => tables[name].loTime !== null,
  )
    .map((name) => ({
      name,
      loTime: tables[name].loTime,
    }))
    .sort((a, b) => a.loTime - b.loTime);

  activeTables.forEach((item) => {
    const div = document.createElement("div");
    div.className = "lo-item";

    // LO時間を過ぎていたら赤く強調
    if (item.loTime <= Date.now()) {
      div.classList.add("lo-expired");
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "lo-table";
    nameSpan.textContent = item.name;

    const timeSpan = document.createElement("span");
    const loDate = new Date(item.loTime);
    timeSpan.textContent = `${String(loDate.getHours()).padStart(2, "0")}:${String(loDate.getMinutes()).padStart(2, "0")}`;

    div.appendChild(nameSpan);
    div.appendChild(timeSpan);
    container.appendChild(div);
  });
}

// 卓クリック処理
function onTableClick(tableName) {
  const table = tables[tableName];
  const currentIndex = STATES.findIndex((s) => s.id === table.state);

  if (table.state === "order-wait") {
    // モーダルを表示
    openModal(tableName);
    return;
  }

  // 食事中で両方単品の場合、アフター完了に直接遷移
  if (
    table.state === "eating" &&
    table.food === "single" &&
    table.drink === "single"
  ) {
    table.state = "after-done";
    table.loTime = null;
    table.stateStartTime = Date.now();
    commitAndRender();
    return;
  }

  // 次の状態に遷移
  const nextIndex = (currentIndex + 1) % STATES.length;
  const nextState = STATES[nextIndex].id;

  table.state = nextState;

  // タイマー開始対象の状態
  if (nextState === "order-wait" || nextState === "after-done") {
    table.stateStartTime = Date.now();
  } else {
    table.stateStartTime = null;
  }

  // 状態に応じた処理
  if (nextState === "empty") {
    table.food = null;
    table.drink = null;
    table.loTime = null;
    table.stateStartTime = null;
  }

  commitAndRender();
}

// モーダル制御
let modalTableName = null;
let modalFood = null;
let modalDrink = null;
let modalTimer = null;

function openModal(tableName) {
  modalTableName = tableName;
  modalFood = "unlimited";
  modalDrink = "unlimited";
  modalTimer = null;

  document.getElementById("modal-title").textContent = `${tableName} オーダー`;
  document.getElementById("modal-overlay").classList.remove("hidden");

  // カスタムタイマー入力をリセット
  document.getElementById("custom-timer-input").value = "";

  // ボタン選択状態をリセット
  document.querySelectorAll(".modal-buttons button").forEach((btn) => {
    btn.classList.remove("selected");
  });

  // デフォルトで放題を選択状態にする
  document
    .querySelectorAll('.modal-buttons button[data-value="unlimited"]')
    .forEach((btn) => {
      btn.classList.add("selected");
    });

  // タイマーセクションの表示を更新
  updateTimerSection();
  updateConfirmButton();
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  modalTableName = null;
  modalFood = null;
  modalDrink = null;
  modalTimer = null;
}

function syncTimerSection(sectionId, food, drink, clearTimer) {
  const section = document.getElementById(sectionId);
  const hasUnlimited = food === "unlimited" || drink === "unlimited";
  section.style.display = hasUnlimited ? "" : "none";
  if (!hasUnlimited) {
    clearTimer();
    section.querySelectorAll("button").forEach((b) => b.classList.remove("selected"));
  }
}

function updateTimerSection() {
  syncTimerSection("timer-section", modalFood, modalDrink, () => { modalTimer = null; });
}

function isTimerOk(sectionId, timer) {
  const visible = document.getElementById(sectionId).style.display !== "none";
  return !visible || timer !== null;
}

function updateConfirmButton() {
  document.getElementById("modal-confirm").disabled = !(
    modalFood && modalDrink && isTimerOk("timer-section", modalTimer)
  );
}

// モーダルのボタンイベント
document.querySelectorAll(".modal-buttons button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.type;
    const value = btn.dataset.value;

    if (type === "food") {
      modalFood = value;
    } else if (type === "drink") {
      modalDrink = value;
    } else if (type === "timer") {
      modalTimer = parseInt(value, 10);
      // カスタム入力をクリア
      document.getElementById("custom-timer-input").value = "";
      document.getElementById("custom-timer-input").classList.remove("active");
    }

    // 同じグループの選択状態を更新
    btn.parentElement
      .querySelectorAll("button")
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");

    // フード/ドリンク変更時にタイマーセクションの表示を更新
    if (type === "food" || type === "drink") {
      updateTimerSection();
    }

    updateConfirmButton();
  });
});

function makeCustomTimerHandler(sectionSelector, setTimer, onUpdate) {
  return (e) => {
    const val = parseInt(e.target.value, 10);
    if (val > 0) {
      setTimer(val);
      e.target.classList.add("active");
      document.querySelectorAll(`${sectionSelector} .timer-buttons button`)
        .forEach((b) => b.classList.remove("selected"));
    } else {
      setTimer(null);
      e.target.classList.remove("active");
    }
    onUpdate();
  };
}

document.getElementById("custom-timer-input").addEventListener("input",
  makeCustomTimerHandler("#timer-section", (v) => { modalTimer = v; }, updateConfirmButton)
);

document.getElementById("modal-confirm").addEventListener("click", () => {
  if (!modalTableName || !modalFood || !modalDrink) return;

  const table = tables[modalTableName];
  table.state = "eating";
  table.food = modalFood;
  table.drink = modalDrink;
  // 放題が含まれる場合のみタイマーを設定
  if (modalTimer) {
    table.loTime = Date.now() + modalTimer * 60 * 1000;
  } else {
    table.loTime = null;
  }

  closeModal();
  commitAndRender();
});

document.getElementById("modal-cancel").addEventListener("click", closeModal);

// 経過時間フォーマット
function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

// 現在時刻更新
function updateCurrentTime() {
  const now = new Date();
  document.getElementById("current-time").textContent =
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// 食事中のタイマーが切れたら自動でアフター待ちに遷移
function checkAutoTransition() {
  const now = Date.now();
  let changed = false;
  TABLE_NAMES.forEach((name) => {
    const table = tables[name];
    if (table.state === "eating" && table.loTime && table.loTime <= now) {
      table.state = "after-wait";
      table.loTime = null;
      table.stateStartTime = null;
      changed = true;
    }
  });
  if (changed) {
    saveTables();
  }
}

// 毎秒更新（タイマー表示 + LOリスト + 現在時刻 + 自動遷移チェック）
setInterval(() => {
  checkAutoTransition();
  if (!longPressCellEl) renderFloorMap();
  renderLOList();
  updateCurrentTime();
}, 1000);

// ゴースト追従（マウス用）
document.addEventListener("mousemove", (e) => {
  if (!longPressActive || !longPressCellEl) return;
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-table-name]")?.dataset.tableName;
  if (over && over !== longPressSourceTable && tables[over]?.state === "eating") {
    if (!longPressGhostEl) createGhost(longPressCellEl, e.clientX, e.clientY);
    else updateGhost(e.clientX, e.clientY);
  } else {
    removeGhost();
  }
});

// メニュー
document.getElementById("menu-btn").addEventListener("click", () => {
  document.getElementById("menu-dropdown").classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest("#menu-wrapper")) {
    document.getElementById("menu-dropdown").classList.add("hidden");
  }
});
document.getElementById("reset-all-btn").addEventListener("click", () => {
  if (!confirm("全ての卓を空にしますか？")) return;
  TABLE_NAMES.forEach((name) => { tables[name] = defaultTableState(); });
  document.getElementById("menu-dropdown").classList.add("hidden");
  commitAndRender();
});

// 初期化
initTables();
renderFloorMap();
renderLOList();
updateCurrentTime();

// 編集モーダル制御
let editModalTableName = null;
let editModalState = null;
let editModalFood = null;
let editModalDrink = null;
let editModalTimer = null;
let editModalBirthday = false;
let editModalAllergy = false;

function openEditModal(tableName) {
  editModalTableName = tableName;
  editModalState = null;
  editModalFood = "unlimited";
  editModalDrink = "unlimited";
  editModalTimer = null;

  const table = tables[tableName];
  editModalBirthday = table.birthday || false;
  editModalAllergy = table.allergy || false;

  document.getElementById("edit-birthday-btn").classList.toggle("selected", editModalBirthday);
  document.getElementById("edit-allergy-btn").classList.toggle("selected", editModalAllergy);

  document.getElementById("edit-modal-title").textContent = `${tableName} 編集`;
  document.getElementById("edit-modal-overlay").classList.remove("hidden");
  document.getElementById("edit-eating-section").classList.add("hidden");
  document.getElementById("edit-modal-confirm").disabled = true;
  document.getElementById("edit-custom-timer-input").value = "";

  // 状態ボタンを動的生成
  const container = document.getElementById("edit-state-buttons");
  container.innerHTML = "";
  STATES.forEach((s) => {
    const btn = document.createElement("button");
    btn.textContent = s.label;
    btn.dataset.stateId = s.id;
    btn.addEventListener("click", () => {
      editModalState = s.id;
      container
        .querySelectorAll("button")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");

      // 食事中を選んだら食事設定を表示
      const eatingSection = document.getElementById("edit-eating-section");
      if (s.id === "eating") {
        eatingSection.classList.remove("hidden");
        // デフォルトで放題を選択状態に
        editModalFood = "unlimited";
        editModalDrink = "unlimited";
        editModalTimer = null;
        eatingSection
          .querySelectorAll(".modal-buttons button")
          .forEach((b) => b.classList.remove("selected"));
        eatingSection
          .querySelectorAll('button[data-value="unlimited"]')
          .forEach((b) => b.classList.add("selected"));
        updateEditTimerSection();
      } else {
        eatingSection.classList.add("hidden");
      }
      updateEditConfirmButton();
    });
    container.appendChild(btn);
  });
}

function closeEditModal() {
  document.getElementById("edit-modal-overlay").classList.add("hidden");
  editModalTableName = null;
  editModalState = null;
  editModalFood = null;
  editModalDrink = null;
  editModalTimer = null;
  editModalBirthday = false;
  editModalAllergy = false;
}

function updateEditTimerSection() {
  syncTimerSection("edit-timer-section", editModalFood, editModalDrink, () => { editModalTimer = null; });
}

function updateEditConfirmButton() {
  if (!editModalState) {
    document.getElementById("edit-modal-confirm").disabled = true;
    return;
  }
  if (editModalState === "eating") {
    document.getElementById("edit-modal-confirm").disabled = !(
      editModalFood && editModalDrink && isTimerOk("edit-timer-section", editModalTimer)
    );
  } else {
    document.getElementById("edit-modal-confirm").disabled = false;
  }
}

document.getElementById("edit-custom-timer-input").addEventListener("input",
  makeCustomTimerHandler("#edit-timer-section", (v) => { editModalTimer = v; }, updateEditConfirmButton)
);

// 編集モーダルのボタンイベント
document
  .querySelectorAll("#edit-eating-section .modal-buttons button")
  .forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.type;
      const value = btn.dataset.value;

      if (type === "edit-food") {
        editModalFood = value;
      } else if (type === "edit-drink") {
        editModalDrink = value;
      } else if (type === "edit-timer") {
        editModalTimer = parseInt(value, 10);
        document.getElementById("edit-custom-timer-input").value = "";
        document
          .getElementById("edit-custom-timer-input")
          .classList.remove("active");
      }

      btn.parentElement
        .querySelectorAll("button")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");

      if (type === "edit-food" || type === "edit-drink") {
        updateEditTimerSection();
      }
      updateEditConfirmButton();
    });
  });

document.getElementById("edit-modal-confirm").addEventListener("click", () => {
  if (!editModalTableName || !editModalState) return;

  const table = tables[editModalTableName];
  table.state = editModalState;

  if (editModalState === "eating") {
    table.food = editModalFood;
    table.drink = editModalDrink;
    if (editModalTimer) {
      table.loTime = Date.now() + editModalTimer * 60 * 1000;
    } else {
      table.loTime = null;
    }
    table.stateStartTime = null;
  } else if (
    editModalState === "order-wait" ||
    editModalState === "after-done"
  ) {
    table.stateStartTime = Date.now();
    table.food = null;
    table.drink = null;
    table.loTime = null;
  } else if (editModalState === "empty") {
    table.food = null;
    table.drink = null;
    table.loTime = null;
    table.stateStartTime = null;
    table.birthday = false;
    table.allergy = false;
  } else {
    table.food = null;
    table.drink = null;
    table.loTime = null;
    table.stateStartTime = null;
  }

  if (editModalState !== "empty") {
    table.birthday = editModalBirthday;
    table.allergy = editModalAllergy;
  }

  closeEditModal();
  commitAndRender();
});

document
  .getElementById("edit-modal-cancel")
  .addEventListener("click", closeEditModal);

document.getElementById("edit-birthday-btn").addEventListener("click", () => {
  editModalBirthday = !editModalBirthday;
  document.getElementById("edit-birthday-btn").classList.toggle("selected", editModalBirthday);
});

document.getElementById("edit-allergy-btn").addEventListener("click", () => {
  editModalAllergy = !editModalAllergy;
  document.getElementById("edit-allergy-btn").classList.toggle("selected", editModalAllergy);
});
