/**
 * Phase 31 — express-validator helpers for consistent input validation.
 */
const { validationResult, body, param, query } = require('express-validator');
const { ApiError } = require('./errorHandler');

function validate(req, _res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return next(
      new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', result.array())
    );
  }
  return next();
}

module.exports = {
  validate,
  body,
  param,
  query,
  validationResult
};
