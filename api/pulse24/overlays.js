const { send, preflight, latestJson } = require("../_util");

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const data = await latestJson("pulse24-overlays.json", () =>
      require("../../pulse24-overlays.json")
    );
    return send(res, 200, data);
  } catch (e) {
    return send(res, 404, { error: "pulse24 overlays not available: " + String(e.message || e) });
  }
};
