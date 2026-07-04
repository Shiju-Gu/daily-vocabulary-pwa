const fs = require("fs");
const path = require("path");
const apiHandler = require("./api/[...path].js");

const publicRoot = path.join(__dirname, "public");
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
};

module.exports = async function app(request, response) {
  const url = new URL(request.url, getBaseUrl(request));

  if (url.pathname.startsWith("/api/")) {
    return apiHandler(request, response);
  }

  return servePublicFile(url, response);
};

function getBaseUrl(request) {
  const host = request.headers.host || "localhost";
  const protocol = request.headers["x-forwarded-proto"] || "https";
  return `${protocol}://${host}`;
}

function servePublicFile(url, response) {
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const fullPath = path.normalize(path.join(publicRoot, requestedPath));

  if (!fullPath.startsWith(publicRoot)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(fullPath, (error, data) => {
    if (error) {
      fs.readFile(path.join(publicRoot, "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) {
          response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Not found");
          return;
        }

        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(fallbackData);
      });
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(fullPath)] || "application/octet-stream",
    });
    response.end(data);
  });
}
