const serverHandler = require("./_server");
const handleRequest = serverHandler.handleRequest || serverHandler;

module.exports = function pronunciationApi(request, response) {
  return handleRequest(request, response);
};
