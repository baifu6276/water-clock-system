// 系統共用狀態與工具
let userId = "";
let userName = "";
let employee = null;
let sites = [];
let settings = {};
let currentPosition = null;
let currentDistance = null;
let gpsAllowed = false;
let sending = false;

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
