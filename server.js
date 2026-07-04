const fs = require("fs");
const path = require("path");
const meaningApi = require("./api/meaning");
const audioApi = require("./api/audio");
const pronunciationApi = require("./api/pronunciation");

const assetMap = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/vocabulary-app.js", ["vocabulary-app.js", "application/javascript; charset=utf-8"]],
  ["/manifest.webmanifest", ["manifest.webmanifest", "application/manifest+json; charset=utf-8"]],
  ["/service-worker.js", ["service-worker.js", "application/javascript; charset=utf-8"]],
  ["/icons/icon-180.png", ["icons/icon-180.png", "image/png"]],
  ["/icons/icon-192.png", ["icons/icon-192.png", "image/png"]],
  ["/icons/icon-512.png", ["icons/icon-512.png", "image/png"]],
]);

const assets = new Map(
  Array.from(assetMap.entries()).map(([route, [file, contentType]]) => [
    route,
    {
      body: fs.readFileSync(path.join(__dirname, file)),
      contentType,
    },
  ]),
);

module.exports = function vocabularyServer(request, response) {
  const url = new URL(request.url, getBaseUrl(request));

  if (url.pathname === "/api/meaning") {
    return meaningApi(request, response);
  }

  if (url.pathname === "/api/audio") {
    return audioApi(request, response);
  }

  if (url.pathname === "/api/pronunciation") {
    return pronunciationApi(request, response);
  }

  const asset = assets.get(url.pathname) || assets.get("/");
  response.writeHead(200, {
    "Content-Type": asset.contentType,
    "Cache-Control": url.pathname === "/service-worker.js" ? "no-cache" : "public, max-age=0, must-revalidate",
  });
  response.end(asset.body);
};

function getBaseUrl(request) {
  const host = request.headers.host || "localhost";
  const protocol = request.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${host}`;
}
