const { handleRequest } = require("../server");

module.exports = function vocabularyApi(request, response) {
  return handleRequest(request, response);
};
