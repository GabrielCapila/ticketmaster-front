/* Configuração */
const API_BASE_URL = "/ticketmaster/api"; // ou http://localhost:5000

let lastLoadedReport = null;
let isBusy = false;

const el = {
  searchText: null,
  filter: null,
  showFullReport: null,
  btnSearch: null,
  btnDownload: null,
  generatedAt: null,
  summaryTableContainer: null,
  detailsTableContainer: null,
  statusMessage: null
};

function $(id) {
  return document.getElementById(id);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function formatBRL(value) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
}

function formatInt(value) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("pt-BR").format(Math.trunc(num));
}

function setLoading(loading) {
  isBusy = loading;
  el.btnSearch.disabled = loading;
  const canDownload = !!lastLoadedReport && !loading;
  el.btnDownload.disabled = !canDownload;

  if (loading) {
    setError("");
    el.statusMessage.classList.remove("error");
    el.statusMessage.textContent = "Carregando relatório…";
  } else {
    if (el.statusMessage.textContent === "Carregando relatório…") {
      el.statusMessage.textContent = "";
    }
  }
}

function setError(message) {
  if (!message) {
    el.statusMessage.classList.remove("error");
    if (el.statusMessage.textContent !== "Carregando relatório…") el.statusMessage.textContent = "";
    return;
  }
  el.statusMessage.classList.add("error");
  el.statusMessage.textContent = message;
}

function getFiltersFromUI() {
  const searchText = (el.searchText.value || "").trim();
  const filter = (el.filter.value || "Todos").trim() || "Todos";
  const showFullReport = !!el.showFullReport.checked;

  return { searchText, filter, showFullReport };
}

async function safeReadErrorBody(response) {
  try {
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      const json = await response.json();
      if (json && typeof json === "object") {
        if (typeof json.message === "string") return json.message;
        if (typeof json.title === "string") return json.title;
      }
      return JSON.stringify(json);
    }
    const text = await response.text();
    return text || response.statusText;
  } catch {
    return response.statusText || "Erro desconhecido";
  }
}

async function fetchReport(filters) {
  const payload = {
    searchText: filters.searchText ?? "",
    filter: filters.filter || "Todos",
    showFullReport: !!filters.showFullReport
  };

  const url = `${API_BASE_URL}/api/reports/events`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const details = await safeReadErrorBody(response);
    throw new Error(`HTTP ${response.status} - ${details}`);
  }

  return response.json();
}

function clearContainers() {
  el.summaryTableContainer.innerHTML = "";
  el.detailsTableContainer.innerHTML = "";
}

function renderSummaryTable(report) {
  const items = Array.isArray(report?.summary) ? report.summary : [];

  if (items.length === 0) {
    el.summaryTableContainer.innerHTML = `<div class="note">Sem dados no resumo.</div>`;
    return;
  }

  const rowsHtml = items.map((x) => {
    return `
      <tr>
        <td>${escapeHtml(x.eventName ?? "")}</td>
        <td>${escapeHtml(x.city ?? "")}</td>
        <td>${escapeHtml(formatDateTime(x.eventDate))}</td>
        <td>${escapeHtml(x.status ?? "")}</td>
      </tr>
    `;
  }).join("");

  el.summaryTableContainer.innerHTML = `
    <table class="table" aria-label="Tabela resumo">
      <thead>
        <tr>
          <th>Evento</th>
          <th>Cidade</th>
          <th>Data</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;
}

function renderDetailsTable(report) {
  const showRequested = !!el.showFullReport.checked;

  if (!showRequested) {
    el.detailsTableContainer.innerHTML = `<div class="note">Marque “Mostrar relatório completo” para exibir esta tabela.</div>`;
    return;
  }

  const details = Array.isArray(report?.details) ? report.details : [];

  if (details.length === 0) {
    el.detailsTableContainer.innerHTML = `<div class="note">Relatório completo sem dados.</div>`;
    return;
  }

  let totalCapacity = 0;
  let totalSold = 0;
  let totalRevenue = 0;

  const rowsHtml = details.map((x) => {
    const capacity = Number(x.capacity);
    const sold = Number(x.sold);
    const revenue = Number(x.revenue);

    if (Number.isFinite(capacity)) totalCapacity += capacity;
    if (Number.isFinite(sold)) totalSold += sold;
    if (Number.isFinite(revenue)) totalRevenue += revenue;

    return `
      <tr>
        <td>${escapeHtml(x.eventName ?? "")}</td>
        <td>${escapeHtml(x.city ?? "")}</td>
        <td>${escapeHtml(formatDateTime(x.eventDate))}</td>
        <td>${escapeHtml(x.status ?? "")}</td>
        <td>${escapeHtml(x.sector ?? "")}</td>
        <td>${escapeHtml(x.priceLevel ?? "")}</td>
        <td class="num">${escapeHtml(formatBRL(x.unitPrice))}</td>
        <td class="num">${escapeHtml(formatInt(x.capacity))}</td>
        <td class="num">${escapeHtml(formatInt(x.sold))}</td>
        <td class="num">${escapeHtml(formatBRL(x.revenue))}</td>
      </tr>
    `;
  }).join("");

  const totalRowHtml = `
    <tr class="total-row">
      <td colspan="7">Total</td>
      <td class="num">${escapeHtml(formatInt(totalCapacity))}</td>
      <td class="num">${escapeHtml(formatInt(totalSold))}</td>
      <td class="num">${escapeHtml(formatBRL(totalRevenue))}</td>
    </tr>
  `;

  el.detailsTableContainer.innerHTML = `
    <table class="table" aria-label="Tabela completa">
      <thead>
        <tr>
          <th>Evento</th>
          <th>Cidade</th>
          <th>Data</th>
          <th>Status</th>
          <th>Setor</th>
          <th>Nível</th>
          <th>Preço</th>
          <th>Capacidade</th>
          <th>Vendido</th>
          <th>Receita</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${totalRowHtml}
      </tbody>
    </table>
  `;
}

function escapeHtml(value) {
  const s = String(value ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setGeneratedAt(report) {
  const v = report?.generatedAt;
  el.generatedAt.textContent = v ? formatDateTime(v) : "—";
}

function fileTimestampYYYYMMDDHHmmss() {
  const d = new Date();
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  const ss = pad2(d.getSeconds());
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

async function downloadExcel(report) {
  if (!report) return;

  const url = `${API_BASE_URL}/api/excel/generate`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(report)
  });

  if (!response.ok) {
    const details = await safeReadErrorBody(response);
    throw new Error(`HTTP ${response.status} - ${details}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const ts = fileTimestampYYYYMMDDHHmmss();
  const filename = ts ? `Relatorio_Eventos_${ts}.xlsx` : "Relatorio_Eventos.xlsx";

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(objectUrl);
}

async function loadReportFromUI() {
  if (isBusy) return;

  const filters = getFiltersFromUI();

  setLoading(true);
  clearContainers();

  try {
    const report = await fetchReport(filters);
    lastLoadedReport = report;

    setGeneratedAt(report);
    renderSummaryTable(report);
    renderDetailsTable(report);

    setError("");
  } catch (err) {
    lastLoadedReport = null;
    setGeneratedAt(null);
    clearContainers();
    setError(err?.message ? String(err.message) : "Erro ao carregar relatório.");
  } finally {
    setLoading(false);
  }
}

function initDefaults() {
  el.searchText.value = "";
  el.filter.value = "Todos";
  el.showFullReport.checked = false;
  el.btnDownload.disabled = true;
}

function bindEvents() {
  el.btnSearch.addEventListener("click", () => loadReportFromUI());

  el.showFullReport.addEventListener("change", () => {
    // Re-render da tabela 2 com base no dataset já carregado.
    renderDetailsTable(lastLoadedReport);
  });

  el.btnDownload.addEventListener("click", async () => {
    if (!lastLoadedReport || isBusy) return;

    setLoading(true);
    try {
      await downloadExcel(lastLoadedReport);
    } catch (err) {
      setError(err?.message ? String(err.message) : "Erro ao gerar Excel.");
    } finally {
      setLoading(false);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  el.searchText = $("searchText");
  el.filter = $("filter");
  el.showFullReport = $("showFullReport");
  el.btnSearch = $("btnSearch");
  el.btnDownload = $("btnDownload");
  el.generatedAt = $("generatedAt");
  el.summaryTableContainer = $("summaryTableContainer");
  el.detailsTableContainer = $("detailsTableContainer");
  el.statusMessage = $("statusMessage");

  initDefaults();
  bindEvents();

  // Carrega automaticamente com defaults:
  // SearchText: "", Filter: "Todos", ShowFullReport: false
  loadReportFromUI();
});
