/**
 * Validate middleware factory
 * @param {Object} schema - Validation schema with field names and their types/requirements
 * @returns {Function} Express middleware function
 */
const validate = (schema) => {
  return (req, res, next) => {
    const errors = [];

    // Check body, query, and params
    const sources = {
      body: req.body,
      query: req.query,
      params: req.params
    };

    for (const [source, data] of Object.entries(sources)) {
      if (!data) continue;

      for (const [field, rules] of Object.entries(schema)) {
        // Skip if field is in a different source
        if (rules.source && rules.source !== source) continue;

        const value = data[field];

        // Check required field
        if (rules.required && (value === undefined || value === null || value === '')) {
          errors.push(`${field} is required`);
          continue;
        }

        // Skip type validation if field is not provided and not required
        if (value === undefined || value === null) continue;

        // Type validation
        if (rules.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          
          if (actualType !== rules.type) {
            errors.push(`${field} must be of type ${rules.type}`);
          }
        }

        // Custom validation function
        if (rules.validate && typeof rules.validate === 'function') {
          const customError = rules.validate(value);
          if (customError) {
            errors.push(customError);
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
        code: 400
      });
    }

    next();
  };
};

export default validate;
