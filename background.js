const DEFAULT_STATE = {
  profile: {
    firstName: "Maya",
    lastName: "Johnson",
    email: "maya.johnson@email.com",
    phone: "(512) 555-0142",
    school: "Cedar Ridge High School",
    graduationYear: "2027",
    gpa: "3.8",
    major: "Computer Science",
    city: "Austin",
    state: "TX"
  },
  applications: {
    "future-builders": "started",
    "stem-forward": "saved",
    "bright-horizons": "saved",
    "code-her-future": "submitted"
  }
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["profile", "applications"]);
  await chrome.storage.local.set({
    profile: existing.profile || DEFAULT_STATE.profile,
    applications: existing.applications || DEFAULT_STATE.applications
  });
});
