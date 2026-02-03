/**
 * Error Handling Middleware
 */

/**
 * Global error handler
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  // Default error
  let status = err.status || 500;
  let message = err.message || 'Internal server error';
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = err.message;
  }
  
  if (err.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  }
  
  // Send error response
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
    path: req.path
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
