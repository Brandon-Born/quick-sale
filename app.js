(function () {
  "use strict";

  const STORAGE_KEY = "garageSaleRecorder.sales.v1";
  const BUCKETS = ["A", "T", "Z"];

  const state = {
    selectedBucket: "A",
    editingSaleId: null,
    pendingDeleteSaleId: null,
    sales: loadSales(),
  };

  const elements = {
    amount: document.querySelector("#saleAmount"),
    form: document.querySelector("#saleForm"),
    status: document.querySelector("#statusMessage"),
    reportStatus: document.querySelector("#reportStatus"),
    todayTotal: document.querySelector("#todayTotal"),
    recentSales: document.querySelector("#recentSales"),
    reportRows: document.querySelector("#reportRows"),
    reportSales: document.querySelector("#reportSales"),
    clearAll: document.querySelector("#clearAllButton"),
    resetDialog: document.querySelector("#resetDialog"),
    resetForm: document.querySelector("#resetForm"),
    resetConfirmInput: document.querySelector("#resetConfirmInput"),
    resetConfirmButton: document.querySelector("#resetConfirmButton"),
    resetCancelButton: document.querySelector("#resetCancelButton"),
    deleteDialog: document.querySelector("#deleteDialog"),
    deleteForm: document.querySelector("#deleteForm"),
    deleteSummary: document.querySelector("#deleteSummary"),
    deleteConfirmButton: document.querySelector("#deleteConfirmButton"),
    deleteCancelButton: document.querySelector("#deleteCancelButton"),
    exportButton: document.querySelector("#exportButton"),
    totals: {
      A: document.querySelector("#totalA"),
      T: document.querySelector("#totalT"),
      Z: document.querySelector("#totalZ"),
      grand: document.querySelector("#grandTotal"),
    },
  };

  const moneyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  init();

  function init() {
    document.querySelectorAll("[data-view-tab]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.viewTab));
    });

    document.querySelectorAll("[data-bucket]").forEach((button) => {
      button.addEventListener("click", () => selectBucket(button.dataset.bucket));
    });

    document.querySelectorAll("[data-amount]").forEach((button) => {
      button.addEventListener("click", () => {
        addQuickAmount(Number.parseFloat(button.dataset.amount));
      });
    });

    elements.form.addEventListener("submit", recordSale);
    elements.recentSales.addEventListener("click", deleteSale);
    elements.reportSales.addEventListener("click", handleReportSaleClick);
    elements.reportSales.addEventListener("submit", saveReportSaleEdit);
    elements.clearAll.addEventListener("click", clearAllSales);
    elements.resetForm.addEventListener("submit", confirmResetSales);
    elements.resetCancelButton.addEventListener("click", closeResetDialog);
    elements.resetConfirmInput.addEventListener("input", updateResetConfirmation);
    elements.deleteForm.addEventListener("submit", confirmDeleteSale);
    elements.deleteCancelButton.addEventListener("click", closeDeleteDialog);
    elements.exportButton.addEventListener("click", exportCsv);

    render();
  }

  function loadSales() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((sale) => BUCKETS.includes(sale.bucket) && Number.isFinite(sale.amount) && sale.date)
        .map((sale) => ({
          id: String(sale.id || makeId()),
          bucket: sale.bucket,
          amount: Math.round(Number(sale.amount) * 100) / 100,
          date: String(sale.date),
          createdAt: sale.createdAt || new Date().toISOString(),
        }));
    } catch (error) {
      return [];
    }
  }

  function saveSales() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.sales));
  }

  function recordSale(event) {
    event.preventDefault();

    const amount = Number.parseFloat(elements.amount.value);
    const recordedAt = new Date();

    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("Enter an amount", true);
      elements.amount.focus();
      return;
    }

    state.sales.unshift({
      id: makeId(),
      bucket: state.selectedBucket,
      amount: Math.round(amount * 100) / 100,
      date: getDateKey(recordedAt),
      createdAt: recordedAt.toISOString(),
    });

    saveSales();
    elements.amount.value = "";
    elements.amount.blur();
    setStatus(`${state.selectedBucket} ${formatMoney(amount)} saved`, false);
    render();
  }

  function addQuickAmount(amount) {
    if (!Number.isFinite(amount)) {
      return;
    }

    const currentAmount = Number.parseFloat(elements.amount.value) || 0;
    elements.amount.value = (Math.round((currentAmount + amount) * 100) / 100).toString();
    elements.amount.focus();
  }

  function deleteSale(event) {
    const button = event.target.closest("[data-delete-id]");
    if (!button) {
      return;
    }

    requestDeleteSale(button.dataset.deleteId);
  }

  function handleReportSaleClick(event) {
    const editButton = event.target.closest("[data-edit-id]");
    if (editButton) {
      state.editingSaleId = editButton.dataset.editId;
      renderReport();
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-edit]");
    if (cancelButton) {
      state.editingSaleId = null;
      renderReport();
      return;
    }

    const deleteButton = event.target.closest("[data-report-delete-id]");
    if (deleteButton) {
      requestDeleteSale(deleteButton.dataset.reportDeleteId);
    }
  }

  function requestDeleteSale(saleId) {
    const sale = state.sales.find((item) => item.id === saleId);
    if (!sale) {
      return;
    }

    state.pendingDeleteSaleId = saleId;
    elements.deleteSummary.textContent = `${sale.bucket} ${formatMoney(sale.amount)} from ${formatDay(sale.date)} at ${formatDateTime(sale.createdAt)} will be removed.`;

    if (typeof elements.deleteDialog.showModal !== "function") {
      if (window.confirm(`Delete ${sale.bucket} sale for ${formatMoney(sale.amount)}?`)) {
        deleteSaleById(saleId);
      }
      return;
    }

    elements.deleteDialog.showModal();
    elements.deleteCancelButton.focus();
  }

  function closeDeleteDialog() {
    elements.deleteDialog.close();
    state.pendingDeleteSaleId = null;
    elements.deleteSummary.textContent = "This sale will be removed.";
  }

  function confirmDeleteSale(event) {
    event.preventDefault();

    const saleId = state.pendingDeleteSaleId;
    closeDeleteDialog();

    if (saleId) {
      deleteSaleById(saleId);
    }
  }

  function deleteSaleById(saleId) {
    state.sales = state.sales.filter((sale) => sale.id !== saleId);
    if (state.editingSaleId === saleId) {
      state.editingSaleId = null;
    }
    state.pendingDeleteSaleId = null;
    saveSales();
    setStatus("Sale deleted", false);
    render();
  }

  function saveReportSaleEdit(event) {
    event.preventDefault();

    const form = event.target;
    const sale = state.sales.find((item) => item.id === form.dataset.editFormId);
    if (!sale) {
      return;
    }

    const amount = Number.parseFloat(form.elements.amount.value);
    const bucket = form.elements.bucket.value;

    if (!Number.isFinite(amount) || amount <= 0 || !BUCKETS.includes(bucket)) {
      setStatus("Enter a valid amount", true);
      return;
    }

    sale.amount = Math.round(amount * 100) / 100;
    sale.bucket = bucket;
    state.editingSaleId = null;
    saveSales();
    setStatus("Sale updated", false);
    render();
  }

  function clearAllSales() {
    if (state.sales.length === 0) {
      return;
    }

    elements.resetConfirmInput.value = "";
    elements.resetConfirmButton.disabled = true;

    if (typeof elements.resetDialog.showModal !== "function") {
      const typedValue = window.prompt('Type "RESET" to delete every sale saved in this browser.');
      if (typedValue !== "RESET") {
        setStatus("Reset canceled", true);
        return;
      }

      resetSales();
      return;
    }

    elements.resetDialog.showModal();
    elements.resetConfirmInput.focus();
  }

  function updateResetConfirmation() {
    elements.resetConfirmButton.disabled = elements.resetConfirmInput.value.trim() !== "RESET";
  }

  function closeResetDialog() {
    elements.resetDialog.close();
    elements.resetConfirmInput.value = "";
    elements.resetConfirmButton.disabled = true;
  }

  function confirmResetSales(event) {
    event.preventDefault();

    if (elements.resetConfirmInput.value.trim() !== "RESET") {
      setStatus("Type RESET to confirm", true);
      elements.resetConfirmInput.focus();
      return;
    }

    closeResetDialog();
    resetSales();
  }

  function resetSales() {
    state.sales = [];
    state.editingSaleId = null;
    saveSales();
    setStatus("All sales reset", false);
    render();
  }

  function selectBucket(bucket) {
    if (!BUCKETS.includes(bucket)) {
      return;
    }

    state.selectedBucket = bucket;
    document.querySelectorAll("[data-bucket]").forEach((button) => {
      const selected = button.dataset.bucket === bucket;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setView(viewName) {
    document.querySelectorAll("[data-view-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.viewTab === viewName);
    });

    document.querySelector("#intakeView").classList.toggle("is-active", viewName === "intake");
    document.querySelector("#reportView").classList.toggle("is-active", viewName === "report");
  }

  function render() {
    renderTodayTotal();
    renderRecentSales();
    renderReport();
  }

  function renderTodayTotal() {
    const today = getTodayKey();
    const total = state.sales
      .filter((sale) => sale.date === today)
      .reduce((sum, sale) => sum + sale.amount, 0);

    elements.todayTotal.textContent = formatMoney(total);
  }

  function renderRecentSales() {
    elements.recentSales.innerHTML = "";

    if (state.sales.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty-message";
      emptyItem.textContent = "No sales recorded";
      elements.recentSales.append(emptyItem);
      return;
    }

    state.sales.slice(0, 10).forEach((sale) => {
      const row = document.createElement("li");
      row.className = "sale-row";

      row.innerHTML = `
        <span class="sale-badge bucket-${sale.bucket.toLowerCase()}-bg">${sale.bucket}</span>
        <span class="sale-details">
          <strong>${formatMoney(sale.amount)}</strong>
          <span>${formatDateTime(sale.createdAt)} · ${formatDay(sale.date)}</span>
        </span>
        <button class="delete-sale" type="button" data-delete-id="${sale.id}" aria-label="Delete ${sale.bucket} sale for ${formatMoney(sale.amount)}">×</button>
      `;

      elements.recentSales.append(row);
    });
  }

  function renderReport() {
    const dailyRows = getDailyRows();
    const allTotals = { A: 0, T: 0, Z: 0, grand: 0 };

    elements.reportRows.innerHTML = "";

    if (dailyRows.length === 0) {
      const emptyRow = document.createElement("tr");
      emptyRow.innerHTML = '<td colspan="5" class="empty-cell">No sales recorded</td>';
      elements.reportRows.append(emptyRow);
    }

    dailyRows.forEach((row) => {
      allTotals.A += row.A;
      allTotals.T += row.T;
      allTotals.Z += row.Z;
      allTotals.grand += row.total;

      const tableRow = document.createElement("tr");
      tableRow.innerHTML = `
        <td>${formatDay(row.date)}</td>
        <td>${formatMoney(row.A)}</td>
        <td>${formatMoney(row.T)}</td>
        <td>${formatMoney(row.Z)}</td>
        <td>${formatMoney(row.total)}</td>
      `;
      elements.reportRows.append(tableRow);
    });

    elements.totals.A.textContent = formatMoney(allTotals.A);
    elements.totals.T.textContent = formatMoney(allTotals.T);
    elements.totals.Z.textContent = formatMoney(allTotals.Z);
    elements.totals.grand.textContent = formatMoney(allTotals.grand);
    renderReportSales();
  }

  function renderReportSales() {
    elements.reportSales.innerHTML = "";

    if (state.sales.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty-message";
      emptyItem.textContent = "No sales recorded";
      elements.reportSales.append(emptyItem);
      return;
    }

    state.sales.forEach((sale) => {
      const row = document.createElement("li");
      row.className = "report-sale-row";

      if (state.editingSaleId === sale.id) {
        row.innerHTML = `
          <form class="report-edit-form" data-edit-form-id="${sale.id}">
            <fieldset class="edit-buckets">
              <legend>Bucket</legend>
              ${BUCKETS.map((bucket) => `
                <label class="edit-bucket edit-bucket-${bucket.toLowerCase()}">
                  <input type="radio" name="bucket" value="${bucket}" ${sale.bucket === bucket ? "checked" : ""}>
                  <span>${bucket}</span>
                </label>
              `).join("")}
            </fieldset>
            <label class="edit-amount">
              <span>Amount</span>
              <input name="amount" inputmode="decimal" type="number" min="0" step="0.01" value="${sale.amount.toFixed(2)}" required>
            </label>
            <div class="edit-actions">
              <button class="text-button" type="submit">Save</button>
              <button class="text-button" type="button" data-cancel-edit>Cancel</button>
              <button class="text-button danger" type="button" data-report-delete-id="${sale.id}">Delete</button>
            </div>
          </form>
        `;
      } else {
        row.innerHTML = `
          <span class="sale-badge bucket-${sale.bucket.toLowerCase()}-bg">${sale.bucket}</span>
          <span class="sale-details">
            <strong>${formatMoney(sale.amount)}</strong>
            <span>${formatDay(sale.date)} · ${formatDateTime(sale.createdAt)}</span>
          </span>
          <span class="report-row-actions">
            <button class="text-button" type="button" data-edit-id="${sale.id}">Edit</button>
            <button class="text-button danger" type="button" data-report-delete-id="${sale.id}">Delete</button>
          </span>
        `;
      }

      elements.reportSales.append(row);
    });
  }

  function getDailyRows() {
    const byDate = new Map();

    state.sales.forEach((sale) => {
      if (!byDate.has(sale.date)) {
        byDate.set(sale.date, { date: sale.date, A: 0, T: 0, Z: 0, total: 0 });
      }

      const row = byDate.get(sale.date);
      row[sale.bucket] += sale.amount;
      row.total += sale.amount;
    });

    return Array.from(byDate.values()).sort((left, right) => right.date.localeCompare(left.date));
  }

  function exportCsv() {
    const header = ["Day", "A", "T", "Z", "Total"];
    const lines = getDailyRows().map((row) => [
      row.date,
      row.A.toFixed(2),
      row.T.toFixed(2),
      row.Z.toFixed(2),
      row.total.toFixed(2),
    ]);

    const csv = [header, ...lines].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `garage-sale-report-${getTodayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function setStatus(message, isError) {
    [elements.status, elements.reportStatus].forEach((statusElement) => {
      if (!statusElement) {
        return;
      }

      statusElement.textContent = message;
      statusElement.style.color = isError ? "var(--danger)" : "var(--ok)";
    });

    window.clearTimeout(setStatus.timeout);
    setStatus.timeout = window.setTimeout(() => {
      [elements.status, elements.reportStatus].forEach((statusElement) => {
        if (statusElement) {
          statusElement.textContent = "";
        }
      });
    }, 2400);
  }

  function getTodayKey() {
    return getDateKey(new Date());
  }

  function getDateKey(date) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
  }

  function formatMoney(amount) {
    return moneyFormatter.format(amount);
  }

  function formatDay(dayKey) {
    const date = new Date(`${dayKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      return dayKey;
    }
    return dayFormatter.format(date);
  }

  function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
})();
