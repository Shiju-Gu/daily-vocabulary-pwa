const serverHandler = require("./_server");
const handleRequest = serverHandler.handleRequest || serverHandler;

module.exports = function audioApi(request, response) {
  return handleRequest(request, response);
};
