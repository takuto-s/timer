// 状態定義
const STATES = [
  { id: "empty", label: "空" },
  { id: "order-wait", label: "オーダー\n待ち" },
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

// LO時間（食事中に遷移してからの制限時間: 90分と仮定）
const LO_DURATION_MS = 90 * 60 * 1000;

// 状態管理
let tables = {};

function initTables() {
  const saved = localStorage.getItem("yakiniku-tables");
  if (saved) {
    tables = JSON.parse(saved);
    // 保存データに存在しない卓を追加
    TABLE_NAMES.forEach((name) => {
      if (!tables[name]) {
        tables[name] = {
          state: "empty",
          food: null,
          drink: null,
          loTime: null,
          stateStartTime: null,
        };
      }
    });
  } else {
    TABLE_NAMES.forEach((name) => {
      tables[name] = {
        state: "empty",
        food: null,
        drink: null,
        loTime: null,
        stateStartTime: null,
      };
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
      const tableName = Object.keys(TABLE_POSITIONS).find(
        (name) =>
          TABLE_POSITIONS[name][0] === c && TABLE_POSITIONS[name][1] === r,
      );

      const cell = document.createElement("div");

      if (tableName) {
        const table = tables[tableName];
        cell.className = `table-cell state-${table.state}`;
        cell.style.gridColumn = c + 1;
        cell.style.gridRow = r + 1;

        const nameEl = document.createElement("div");
        nameEl.className = "table-name";
        nameEl.textContent = tableName;
        cell.appendChild(nameEl);

        const statusEl = document.createElement("div");
        statusEl.className = "table-status";
        const stateObj = STATES.find((s) => s.id === table.state);
        statusEl.textContent = stateObj ? stateObj.label : "";
        cell.appendChild(statusEl);

        // 食事中の場合、フード/ドリンク情報を表示
        if (table.state === "eating") {
          const infoEl = document.createElement("div");
          infoEl.className = "table-info";
          const foodLabel = table.food === "unlimited" ? "F:放題" : "F:単品";
          const drinkLabel = table.drink === "unlimited" ? "D:放題" : "D:単品";
          infoEl.innerHTML = `${foodLabel}<br>${drinkLabel}`;
          cell.appendChild(infoEl);
        }

        // オーダー待ち・アフター完了の経過時間表示
        if (
          (table.state === "order-wait" || table.state === "after-done") &&
          table.stateStartTime
        ) {
          const timerEl = document.createElement("div");
          timerEl.className = "table-info";
          timerEl.textContent = formatElapsed(
            Date.now() - table.stateStartTime,
          );
          cell.appendChild(timerEl);
        }

        cell.addEventListener("click", () => onTableClick(tableName));
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

  saveTables();
  renderFloorMap();
  renderLOList();
}

// モーダル制御
let modalTableName = null;
let modalFood = null;
let modalDrink = null;

function openModal(tableName) {
  modalTableName = tableName;
  modalFood = null;
  modalDrink = null;

  document.getElementById("modal-title").textContent = `${tableName} オーダー`;
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-confirm").disabled = true;

  // ボタン選択状態をリセット
  document.querySelectorAll(".modal-buttons button").forEach((btn) => {
    btn.classList.remove("selected");
  });
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  modalTableName = null;
  modalFood = null;
  modalDrink = null;
}

function updateConfirmButton() {
  document.getElementById("modal-confirm").disabled = !(
    modalFood && modalDrink
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
    }

    // 同じグループの選択状態を更新
    btn.parentElement
      .querySelectorAll("button")
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");

    updateConfirmButton();
  });
});

document.getElementById("modal-confirm").addEventListener("click", () => {
  if (!modalTableName || !modalFood || !modalDrink) return;

  const table = tables[modalTableName];
  table.state = "eating";
  table.food = modalFood;
  table.drink = modalDrink;
  table.loTime = Date.now() + LO_DURATION_MS;

  saveTables();
  closeModal();
  renderFloorMap();
  renderLOList();
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

// 毎秒更新（タイマー表示 + LOリスト + 現在時刻）
setInterval(() => {
  renderFloorMap();
  renderLOList();
  updateCurrentTime();
}, 1000);

// 初期化
initTables();
renderFloorMap();
renderLOList();
updateCurrentTime();
