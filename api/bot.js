const { send, latestJson } = require("./_util");

const OWNER = "simonhansen654";
const REPO = "trading-dashboard";
const PATH = "bot-control.json";
const BRANCH = "main";

const DEFAULT = {
  crypto_tjr: true,
  updated_at: null,
  updated_by: "default",
  note: "Paper only. When crypto_tjr is false, crypto TJR and Pulse24 skip new entries.",
};

function cors(res, methods) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function ghGetFile(token) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "AtlasDesk-bot-control",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (r.status === 404) return { sha: null, data: null };
  if (!r.ok) throw new Error(`GitHub GET ${r.status}`);
  const j = await r.json();
  const text = Buffer.from(j.content || "", "base64").toString("utf8");
  return { sha: j.sha, data: JSON.parse(text) };
}

async function ghPutFile(token, contentObj, sha) {
  const body = JSON.stringify(contentObj, null, 2) + "\n";
  const payload = {
    message: `bot-control: crypto_tjr=${contentObj.crypto_tjr} via UI`,
    content: Buffer.from(body, "utf8").toString("base64"),
    branch: BRANCH,
  };
  if (sha) payload.sha = sha;
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "AtlasDesk-bot-control",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub PUT ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

module.exports = async function handler(req, res) {
  cors(res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    try {
      const data = await latestJson("bot-control.json", () => {
        try {
          return require("../bot-control.json");
        } catch (_) {
          return DEFAULT;
        }
      });
      return send(res, 200, data && typeof data === "object" ? data : DEFAULT);
    } catch (e) {
      return send(res, 500, { error: String(e.message || e) });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await readBody(req);
      if (typeof body.crypto_tjr !== "boolean") {
        return send(res, 400, { error: "crypto_tjr boolean required" });
      }
      const updated_at = new Date().toISOString();
      const next = {
        crypto_tjr: body.crypto_tjr,
        updated_at,
        updated_by: body.updated_by || "ui",
        note:
          body.note ||
          "Paper only. When crypto_tjr is false, crypto TJR and Pulse24 skip new entries.",
      };

      const token =
        process.env.GITHUB_TOKEN ||
        process.env.BOT_CONTROL_TOKEN ||
        process.env.GH_TOKEN ||
        "";

      if (!token) {
        return send(res, 200, {
          ...next,
          persisted: false,
          persist_target: "none",
          message:
            "Gemt i browser (localStorage). Ingen GITHUB_TOKEN/BOT_CONTROL_TOKEN på Vercel — sync ved næste agent-run, eller bed Trading opdatere bot-control.json.",
        });
      }

      const current = await ghGetFile(token);
      await ghPutFile(token, next, current.sha);
      return send(res, 200, {
        ...next,
        persisted: true,
        persist_target: "github",
        message: "Synket til GitHub bot-control.json",
      });
    } catch (e) {
      return send(res, 500, { error: String(e.message || e), persisted: false });
    }
  }

  return send(res, 405, { error: "method not allowed" });
};
