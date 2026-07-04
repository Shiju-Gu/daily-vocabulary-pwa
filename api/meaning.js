const serverHandler = require("./_server");
const handleRequest = serverHandler.handleRequest || serverHandler;

module.exports = function meaningApi(request, response) {
  return handleRequest(request, response);
};
