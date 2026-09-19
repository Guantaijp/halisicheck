import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Uniform error shape for every failure.
 *
 * Unexpected errors are logged with their stack but answered with a generic
 * message — an internal error text can leak connection strings, file paths and
 * query fragments to the caller.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (isHttp) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
        error = exception.name;
      } else {
        const record = payload as Record<string, unknown>;
        message = (record.message as string | string[]) ?? exception.message;
        error = (record.error as string) ?? exception.name;
      }
    } else {
      this.logger.error(
        `Unhandled ${request.method} ${request.url}: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }
}
