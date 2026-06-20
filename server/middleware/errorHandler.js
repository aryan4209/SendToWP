const { error } = require("../utils/apiResponse");

const notFound = (req, res) => error(res, 404, "Route not found");

const errorHandler = (err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  return error(res, err.statusCode || 500, err.message || "Internal server error");
};

module.exports = { notFound, errorHandler };
