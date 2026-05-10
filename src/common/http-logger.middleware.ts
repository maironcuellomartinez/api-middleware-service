import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('HTTP');

    use(req: Request, res: Response, next: NextFunction): void {
        const { method, originalUrl, ip } = req;
        const start = Date.now();

        res.once('finish', () => {
            const ms    = Date.now() - start;
            const code  = res.statusCode;
            const color = code >= 500 ? 'error' : code >= 400 ? 'warn' : 'log';
            this.logger[color](`${method} ${originalUrl} → ${code} (${ms}ms) [${ip}]`);
        });

        next();
    }
}
