const BASE = "http://localhost:8000";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getAthletes: () => req("/athletes"),
  createAthlete: (data) =>
    req("/athletes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteAthlete: (id) => req(`/athletes/${id}`, { method: "DELETE" }),
  getActivities: (id, oldest, newest) => {
    const params = new URLSearchParams();
    if (oldest) params.set("oldest", oldest);
    if (newest) params.set("newest", newest);
    return req(`/athletes/${id}/activities?${params}`);
  },
  getWellness: (id) => req(`/athletes/${id}/wellness`),
  getEvents: (id) => req(`/athletes/${id}/events`),
};
