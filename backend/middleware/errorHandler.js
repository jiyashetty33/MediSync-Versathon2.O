/**
 * Centralized error handler middleware.
 * Ensures consistent JSON response structure:
 * { "success": false, "message": "...", "error": {} }
 */
function errorHandler(err, req, res, next) {
  // If response has already started sending, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
  const message = err.message || 'Internal Server Error';

  console.error(`[Error ${statusCode}] ${req.method} ${req.originalUrl}:`, err);

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: err.code || 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? (err.stack || err) : undefined
    }
  });
}

/**
 * 404 Not Found handler for undefined routes.
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `Endpoint not found: ${req.method} ${req.originalUrl}`,
    error: {}
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
