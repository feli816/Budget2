export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (details) {
      this.details = details;
    }
  }
}

export function notFound(message = 'Resource not found') {
  return new HttpError(404, message);
}

export function badRequest(message = 'Invalid request', details) {
  return new HttpError(400, message, details);
}

export function conflict(message = 'Conflict') {
  return new HttpError(409, message);
}

export function mapDatabaseError(error) {
  if (!error || !error.code) {
    return error;
  }

  switch (error.code) {
    case '23505':
      return conflict('Duplicate value violates unique constraint');
    case '23503':
      return badRequest('Invalid reference. Check related entity IDs.');
    case '23502':
      return badRequest('Missing required database field.');
    case '22P02':
      return badRequest('Invalid input syntax for one of the fields.');
    default:
      return error;
  }
}
