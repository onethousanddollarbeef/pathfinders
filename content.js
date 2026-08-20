const FIELD_ALIASES = {
  firstName: ["first name", "firstname", "given name"], lastName: ["last name", "lastname", "surname", "family name"],
  email: ["email", "email address"], phone: ["phone", "mobile", "telephone"], school: ["school", "high school", "institution"],
  graduationYear: ["graduation year", "grad year", "year of graduation"], gpa: ["gpa", "grade point average"],
  major: ["major", "field of study", "intended major"], city: ["city", "town"], state: ["state", "province"]
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "AUTOFILL") return;
  let filled = 0;
  document.querySelectorAll("input:not([type=hidden]):not([type=submit]), textarea, select").forEach((field) => {
    const label = document.querySelector(`label[for="${CSS.escape(field.id || "__none")}"]`)?.textContent || "";
    const identity = [field.name, field.id, field.placeholder, field.getAttribute("aria-label"), label].filter(Boolean).join(" ").toLowerCase();
    const match = Object.entries(FIELD_ALIASES).find(([, aliases]) => aliases.some((alias) => identity.includes(alias)));
    if (!match || !message.profile[match[0]] || field.value) return;
    field.value = message.profile[match[0]];
    field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true }));
    field.style.outline = "2px solid #7657d8"; field.style.outlineOffset = "2px"; filled += 1;
  });
  sendResponse({ filled });
  return true;
});
