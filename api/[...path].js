const serverHandler = require("../server");
const handleRequest = serverHandler.handleRequest || serverHandler;

module.exports = function vocabularyApi(request, response) {
  return handleRequest(request, response);
};
