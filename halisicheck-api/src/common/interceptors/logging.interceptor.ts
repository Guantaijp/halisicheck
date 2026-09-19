import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.logger.log(`${method} ${url} ${Date.now() - startedAt}ms`),
        error: (error: Error) =>
          this.logger.warn(`${method} ${url} failed in ${Date.now() - startedAt}ms: ${error.message}`),
      }),
    );
  }
}
