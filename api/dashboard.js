const { send, preflight, latestJson } = require("./_util");

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const data = await latestJson("dashboard-data.json", () =>
      require("../dashboard-data.json")
    );
    return send(res, 200, data);
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
};
