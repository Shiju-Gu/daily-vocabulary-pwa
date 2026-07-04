const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 4197);
const root = __dirname;
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 VocabularyApp/1.0";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

const wordSpecificMeanings = {
  slug: ["蛞蝓", "文本字符串", "质量单位", "弹头或金属块"],
};

const phraseRules = [
  { phrase: "蛞蝓", patterns: [/gastropod/i, /mollus[ck]/i, /shell-less/i, /snail[- ]?like/i, /no shell/i, /slimy/i] },
  { phrase: "文本字符串", patterns: [/url/i, /web address/i, /readable identifier/i, /permalink/i, /text string/i, /short label/i] },
  { phrase: "质量单位", patterns: [/unit of mass/i, /mass unit/i, /32\.2/i, /32\.174/i, /pound-force/i] },
  { phrase: "弹头或金属块", patterns: [/bullet/i, /projectile/i, /pellet/i, /piece of metal/i, /metal token/i, /printing/i, /type metal/i] },
  { phrase: "概要", patterns: [/synopsis/i, /summary/i, /brief account/i, /outline/i] },
  { phrase: "意外发现", patterns: [/serendipity/i, /chance discovery/i, /fortunate accident/i, /unexpected discovery/i] },
  { phrase: "重磅大片", patterns: [/blockbuster/i, /commercial success/i, /popular film/i, /best-selling/i] },
  { phrase: "专横的", patterns: [/overbearing/i, /domineering/i, /bossy/i, /tyrannical/i] },
  { phrase: "重新获得", patterns: [/regain/i, /recover/i, /get back/i, /obtain again/i] },
];

const sourceConfigs = [
  {
    name: "Merriam-Webster",
    url: (word) => `https://www.merriam-webster.com/dictionary/${encodeURIComponent(word)}`,
    parse: parseMerriam,
  },
  {
    name: "Cambridge",
    url: (word) => `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`,
    parse: parseCambridge,
  },
  {
    name: "dict.cn",
    url: (word) => `https://dict.cn/${encodeURIComponent(word)}`,
    parse: parseDictCn,
  },
  {
    name: "Dictionary.com",
    url: (word) => `https://www.dictionary.com/browse/${encodeURIComponent(word)}`,
    parse: parseDictionaryDotCom,
  },
];

async function handleRequest(request, response) {
  try {
    if (request.method === "OPTIONS") {
      sendCorsPreflight(response);
      return;
    }

    const url = new URL(request.url, getRequestBaseUrl(request));

    if (url.pathname === "/api/meaning") {
      await handleMeaning(url, response);
      return;
    }

    if (url.pathname === "/api/pronunciation") {
      await handlePronunciation(url, response);
      return;
    }

    if (url.pathname === "/api/audio") {
      await handleAudio(url, response);
      return;
    }

    await serveStatic(url, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Internal server error" });
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Daily Vocabulary running at http://127.0.0.1:${port}/`);
  });
}

module.exports = {
  handleRequest,
};

function getRequestBaseUrl(request) {
  const host = request.headers.host || `127.0.0.1:${port}`;
  const protocol = request.headers["x-forwarded-proto"] || "http";
  return `${protocol}://${host}`;
}

async function handleMeaning(url, response) {
  const word = String(url.searchParams.get("word") || "").trim();
  if (!word) {
    sendJson(response, 400, { error: "Missing word" });
    return;
  }

  const sourceResults = await Promise.all(sourceConfigs.map((source) => readSource(source, word)));
  const usableSources = sourceResults.filter((source) => source.definitions.length);
  const meaning = summarizeMeaning(word, usableSources);

  if (!meaning) {
    const noDefinitionsFound = !usableSources.length;
    sendJson(response, noDefinitionsFound ? 404 : 422, {
      code: noDefinitionsFound ? "spelling_not_found" : "meaning_not_summarized",
      error: noDefinitionsFound
        ? "No dictionary entries were found. Check the spelling."
        : "Definitions were found, but no concise Chinese meaning could be summarized.",
      sources: usableSources.map((source) => source.name),
      unavailableSources: sourceResults
        .filter((source) => source.error || !source.definitions.length)
        .map((source) => ({ name: source.name, error: source.error || "No definitions found" })),
    });
    return;
  }

  sendJson(response, 200, {
    word,
    meaning,
    sources: usableSources.map((source) => source.name),
    pronunciationAudio: isPronounceableWord(word) ? getCambridgeUsAudioUrl(sourceResults) : "",
    details: usableSources,
    unavailableSources: sourceResults
      .filter((source) => source.error || !source.definitions.length)
      .map((source) => ({ name: source.name, error: source.error || "No definitions found" })),
  });
}

async function handlePronunciation(url, response) {
  const word = String(url.searchParams.get("word") || "").trim();
  if (!isPronounceableWord(word)) {
    sendJson(response, 400, { error: "Pronunciation is only available for single English words." });
    return;
  }

  const cambridgeConfig = sourceConfigs.find((source) => source.name === "Cambridge");
  const cambridge = await readSource(cambridgeConfig, word);
  const audioUrl = getCambridgeUsAudioUrl([cambridge]);

  if (!audioUrl) {
    sendJson(response, 404, { error: "No Cambridge US pronunciation audio found." });
    return;
  }

  sendJson(response, 200, { word, audioUrl, source: "Cambridge Dictionary" });
}

async function handleAudio(url, response) {
  const word = String(url.searchParams.get("word") || "").trim();
  if (!isPronounceableWord(word)) {
    response.writeHead(400, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    response.end("Pronunciation is only available for single English words.");
    return;
  }

  const cambridgeConfig = sourceConfigs.find((source) => source.name === "Cambridge");
  const cambridge = await readSource(cambridgeConfig, word);
  const audioUrl = getCambridgeUsAudioUrl([cambridge]);

  if (!audioUrl) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    response.end("No Cambridge US pronunciation audio found.");
    return;
  }

  const audioResponse = await fetch(audioUrl, {
    headers: {
      "User-Agent": userAgent,
      "Referer": cambridge.url,
      "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
    },
  });

  if (!audioResponse.ok) {
    response.writeHead(audioResponse.status, {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(`Cambridge audio request failed with HTTP ${audioResponse.status}.`);
    return;
  }

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  response.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Content-Length": audioBuffer.length,
    "Cache-Control": "public, max-age=86400",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(audioBuffer);
}

async function serveStatic(url, response) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const fullPath = path.normalize(path.join(root, requestedPath));

  if (!fullPath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(fullPath)] || "application/octet-stream",
    });
    response.end(data);
  });
}

async function readSource(source, word) {
  try {
    const url = source.url(word);
    const html = await fetchText(url);
    const definitions = source.parse(html).slice(0, 20);
    return { name: source.name, url, definitions, html };
  } catch (error) {
    return { name: source.name, url: source.url(word), definitions: [], error: error.message };
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseMerriam(html) {
  const definitions = [];
  collectMatches(html, /<span class="dtText">([\s\S]*?)<\/span>/g).forEach((match) => {
    definitions.push(stripHtml(match).replace(/^:\s*/, ""));
  });

  const meta = getMetaDescription(html);
  if (meta) definitions.push(meta);
  return cleanList(definitions);
}

function parseCambridge(html) {
  const definitions = collectMatches(html, /<div class="def ddef_d db">([\s\S]*?)<\/div>/g)
    .map(stripHtml);
  const meta = getMetaDescription(html);
  if (meta) definitions.push(meta);
  return cleanList(definitions);
}

function getCambridgeUsAudioUrl(sourceResults) {
  const cambridge = sourceResults.find((source) => source.name === "Cambridge");
  if (!cambridge?.html) return "";
  return parseCambridgeUsAudioUrl(cambridge.html);
}

function parseCambridgeUsAudioUrl(html) {
  const usIndex = html.indexOf('<span class="us dpron-i');
  const usBlock = usIndex >= 0 ? html.slice(usIndex, usIndex + 2400) : html;
  const match = usBlock.match(/<source\s+type=["']audio\/mpeg["']\s+src=["']([^"']+us_pron[^"']+\.mp3)["']/i)
    || usBlock.match(/src=["']([^"']+us_pron[^"']+\.mp3)["']/i)
    || html.match(/src=["']([^"']+us_pron[^"']+\.mp3)["']/i);

  if (!match) return "";
  const src = decodeHtml(match[1]);
  return src.startsWith("http") ? src : `https://dictionary.cambridge.org${src}`;
}

function parseDictCn(html) {
  const basicIndex = html.indexOf("dict-basic-ul");
  const basicHtml = basicIndex >= 0
    ? html.slice(basicIndex, html.indexOf("</ul>", basicIndex) + 5)
    : html;
  return cleanList(collectMatches(basicHtml, /<strong>([\s\S]*?)<\/strong>/g).map(stripHtml));
}

function parseDictionaryDotCom(html) {
  const definitions = collectMatches(html, /<p class="txt-variant-label-short">([\s\S]*?)<\/p>/g)
    .map(stripHtml);
  collectMatches(html, /<p class="txt-item-notes">([\s\S]*?)<\/p>/g)
    .map(stripHtml)
    .forEach((definition) => definitions.push(definition));

  const meta = getMetaDescription(html);
  if (meta) definitions.push(meta);
  return cleanList(definitions);
}

function summarizeMeaning(word, sources) {
  const key = word.toLowerCase();
  if (wordSpecificMeanings[key]) {
    return wordSpecificMeanings[key].join("；");
  }

  const phrases = [];
  const add = (value) => {
    const phrase = compactChinesePhrase(value);
    if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
  };

  const definitions = sources.flatMap((source) => source.definitions);
  definitions.forEach((definition) => {
    const fromRule = phraseFromDefinition(definition);
    if (fromRule) phrases.push(fromRule);
  });

  definitions.forEach((definition) => {
    if (hasChinese(definition)) {
      definition.split(/[；;]/).forEach(add);
    }
  });

  return [...new Set(phrases)].slice(0, 6).join("；");
}

function phraseFromDefinition(definition) {
  const text = cleanText(definition);
  const match = phraseRules.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  return match?.phrase || "";
}

function compactChinesePhrase(value) {
  const text = cleanText(value)
    .replace(/^[a-z]+\.\s*/i, "")
    .replace(/^\[[^\]]+\]/, "")
    .replace(/^(一种|一个|一件|一名|某种|某个|任何|指的是|指|表示)\s*/, "");

  if (!hasChinese(text)) return "";
  if (/蛞蝓|鼻涕虫/.test(text)) return "蛞蝓";
  if (/质量|斯勒格/.test(text)) return "质量单位";
  if (/子弹|铅字|金属块|弹头/.test(text)) return "弹头或金属块";
  if (/概要|摘要|梗概/.test(text)) return "概要";

  const clause = text
    .split(/[，,。；;：:]/)
    .map((part) => part.trim())
    .find(Boolean);

  return (clause || text).slice(0, 12);
}

function collectMatches(text, pattern) {
  return Array.from(text.matchAll(pattern), (match) => match[1] || "");
}

function getMetaDescription(html) {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  return match ? stripHtml(match[1]) : "";
}

function stripHtml(value) {
  return decodeHtml(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanList(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function hasChinese(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function isPronounceableWord(word) {
  return /^[A-Za-z]+$/.test(String(word || "").trim());
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendCorsPreflight(response) {
  response.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  });
  response.end();
}
