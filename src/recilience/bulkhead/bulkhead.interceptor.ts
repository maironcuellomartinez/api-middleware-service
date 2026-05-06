import {
    Injectable, NestInterceptor, ExecutionContext, CallHandler,
    ServiceUnavailableException, RequestTimeoutException,
} from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';
import { BulkheadRegistry } from './bulkhead.registry';
import { BulkheadRejectedError, BulkheadTimeoutError } from './bulkhead';

@Injectable()
export class BulkheadInterceptor implements NestInterceptor {
    constructor(private readonly bulkheadRegistry: BulkheadRegistry) { }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request    = context.switchToHttp().getRequest();
        const clientId   = request.headers['x-client-id'] || 'anonymous';
        const handlerName = context.getHandler().name;

        const bulkhead = this.bulkheadRegistry.getForClient(clientId, handlerName);

        try {
            const result = await bulkhead.execute(() => firstValueFrom(next.handle()));
            return new Observable(subscriber => { subscriber.next(result); subscriber.complete(); });
        } catch (error) {
            if (error instanceof BulkheadRejectedError) {
                throw new ServiceUnavailableException(
                    'El servicio está al límite de capacidad — intente nuevamente en unos momentos',
                );
            }
            if (error instanceof BulkheadTimeoutError) {
                throw new RequestTimeoutException(
                    'La solicitud expiró esperando procesamiento — intente nuevamente',
                );
            }
            throw error;
        }
    }
}
