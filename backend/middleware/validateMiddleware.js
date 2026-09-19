const { validationResult } = require('express-validator');

/**
 * Middleware that checks for validation errors from express-validator.
 * Returns standard 400 Bad Request response if any validation rules failed.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorDetails = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      message: `Validation error: ${errorDetails.map(e => `${e.field} - ${e.message}`).join('; ')}`,
      error: { errors: errorDetails }
    });
  }
  next();
}

module.exports = {
  validate
};
