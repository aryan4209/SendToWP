const success = (res, message, data = {}) =>
  res.status(200).json({ success: true, message, data });

const created = (res, message, data = {}) =>
  res.status(201).json({ success: true, message, data });

const error = (res, statusCode, message) =>
  res.status(statusCode).json({ success: false, message });

module.exports = { success, created, error };
