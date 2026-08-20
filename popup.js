const scholarships = [
  { id: "stem-forward", tag: "STEM", match: 92, title: "STEM Forward Grant", sponsor: "American Science Council", award: "$5,000", deadline: "Aug 29", days: "17 days", effort: "Low", why: "Your STEM focus and academic record make you a standout applicant." },
  { id: "bright-horizons", tag: "COMMUNITY", match: 89, title: "Bright Horizons Award", sponsor: "Community First Foundation", award: "$2,500", deadline: "Sep 4", days: "23 days", effort: "Medium", why: "Your local community involvement aligns with this award's mission." },
  { id: "code-her-future", tag: "WOMEN IN TECH", match: 87, title: "Code Her Future", sponsor: "Women Who Build", award: "$7,000", deadline: "Sep 12", days: "31 days", effort: "High", why: "Your Computer Science goals match their women-in-tech criteria." }
];

const profileFields = [
  ["firstName", "First name"], ["lastName", "Last name"], ["email", "Email address"], ["phone", "Phone number"],
  ["school", "Current school"], ["graduationYear", "Graduation year"], ["gpa", "GPA"], ["major", "Intended major"], ["city", "City"], ["state", "State"]
];

let state = { profile: {}, applications: {} };

async function initialize() {
  state = await chrome.storage.local.get(["profile", "applications"]);
  state.profile ||= {};
  state.applications ||= {};
  renderMatches();
  renderProfile();
  renderTracker();
  bindEvents();
}

function renderMatches() {
  document.querySelector("#match-grid").innerHTML = scholarships.map((s) => `
    <article class="match-card">
      <div class="card-top"><span class="category">${s.tag}</span><button class="bookmark ${state.applications[s.id] ? "active" : ""}" data-id="${s.id}">♥</button></div>
      <span class="match">● ${s.match}% match</span><h3>${s.title}</h3><p class="sponsor">${s.sponsor}</p>
      <div class="mini-metrics"><div><small>AWARD</small><b>${s.award}</b></div><div><small>DEADLINE</small><b>${s.deadline}</b><em>${s.days}</em></div></div>
      <div class="why small"><span>✦</span><p>${s.why}</p></div>
      <div class="match-footer"><span><small>EFFORT</small><b>${s.effort}</b></span><button class="secondary details-button">View scholarship</button></div>
    </article>`).join("");
}

function renderProfile() {
  document.querySelector("#profile-form").innerHTML = profileFields.map(([key, label]) => `<label>${label}<input name="${key}" value="${escapeHtml(state.profile[key] || "")}" autocomplete="off" /></label>`).join("");
}

function renderTracker() {
  const all = [{ id: "future-builders", title: "Future Builders Scholarship" }, ...scholarships];
  document.querySelector("#tracker").innerHTML = all.map((item) => `<article><span class="category">${state.applications[item.id] || "saved"}</span><strong>${item.title}</strong><select data-app-id="${item.id}"><option value="saved">Saved</option><option value="started">Started</option><option value="submitted">Submitted</option></select></article>`).join("");
  document.querySelectorAll("select[data-app-id]").forEach((select) => { select.value = state.applications[select.dataset.appId] || "saved"; });
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const nav = event.target.closest("[data-view]");
    if (nav) showView(nav.dataset.view);
    const bookmark = event.target.closest(".bookmark");
    if (bookmark) {
      const id = bookmark.dataset.id;
      if (state.applications[id]) delete state.applications[id]; else state.applications[id] = "saved";
      await saveApplications(); renderMatches(); showToast(state.applications[id] ? "Scholarship saved" : "Removed from saved");
    }
    if (event.target.closest(".details-button")) showToast("Scholarship details ready to review");
    if (event.target.closest(".back-home")) showView("dashboard");
  });
  document.querySelector("#save-profile").addEventListener("click", saveProfile);
  document.querySelector("#autofill").addEventListener("click", autofillPage);
  document.querySelector("#tracker").addEventListener("change", async (event) => {
    if (!event.target.dataset.appId) return;
    state.applications[event.target.dataset.appId] = event.target.value; await saveApplications(); showToast("Application status updated");
  });
}

function showView(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === id));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === id));
}

async function saveProfile(event) {
  event.preventDefault();
  state.profile = Object.fromEntries(new FormData(document.querySelector("#profile-form")));
  await chrome.storage.local.set({ profile: state.profile }); showToast("Profile saved");
}

async function saveApplications() { await chrome.storage.local.set({ applications: state.applications }); renderTracker(); }

async function autofillPage() {
  await saveProfile(new Event("submit"));
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { type: "AUTOFILL", profile: state.profile });
    showToast(`Filled ${result.filled} field${result.filled === 1 ? "" : "s"} on this page`);
  } catch { showToast("Open an application page to use autofill"); }
}

function showToast(message) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2400); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }

initialize();
