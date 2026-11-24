class AppError(Exception):
    status_code = 500
    default_detail = "Internal error."

    def __init__(self, detail: str | None = None):
        self.detail = detail or self.default_detail
        super().__init__(self.detail)


class BadRequestError(AppError):
    status_code = 400
    default_detail = "Bad request."


class NotFoundError(AppError):
    status_code = 404
    default_detail = "Not found."


class ConflictError(AppError):
    status_code = 409
    default_detail = "Conflict."


class UpstreamError(AppError):
    status_code = 502
    default_detail = "Upstream service error."


class ServiceUnavailableError(AppError):
    status_code = 503
    default_detail = "Service unavailable."