import { Injectable } from '@nestjs/common';

export interface RequestLog {
    id: number;
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    ip: string;
    userAgent: string;
    timestamp: string;
}

@Injectable()
export class LogsService {
    private readonly buffer: RequestLog[] = [];
    private readonly MAX = 50;
    private nextId = 1;

    push(log: Omit<RequestLog, 'id' | 'timestamp'>): void {
        if (this.buffer.length >= this.MAX) {
            this.buffer.shift();
        }
        this.buffer.push({ ...log, id: this.nextId++, timestamp: new Date().toISOString() });
    }

    findRecent(limit: number): RequestLog[] {
        return this.buffer.slice(-limit).reverse();
    }
}
