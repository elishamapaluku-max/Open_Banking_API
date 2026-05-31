/**
 * Success response helper
 */
const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Error response helper
 */
const error = (res, message = 'Something went wrong', statusCode = 500, details = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    details,
    timestamp: new Date().toISOString()
  });
};

/**
 * Paginated response helper
 */
const paginated = (res, data, page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  const responseData = {
    ...data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev
    }
  };

  return res.status(200).json({
    success: true,
    message: 'Success',
    data: responseData,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  success,
  error,
  paginated
};
