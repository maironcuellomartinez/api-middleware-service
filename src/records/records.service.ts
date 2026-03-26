import { Injectable } from '@nestjs/common';
import { GatewayClient } from '../gateway/gateway.client';
import { ListRecordsDto } from './dto/list-records.dto';

@Injectable()
export class RecordsService {
    constructor(private readonly gateway: GatewayClient) {}

    getIncidentByNumber(number: string) {
        return this.gateway.getIncidentByNumber(number);
    }

    getRequestByNumber(number: string) {
        return this.gateway.getRequestByNumber(number);
    }

    async listRecords(query: ListRecordsDto) {
        const params: Record<string, string> = {};
        if (query.status)      params.status      = query.status;
        if (query.issueTypeId) params.issueTypeId = query.issueTypeId;
        if (query.cornerId)    params.cornerId     = query.cornerId;
        if (query.dateFrom)    params.dateFrom     = query.dateFrom;
        if (query.dateTo)      params.dateTo       = query.dateTo;
        if (query.page)        params.page         = String(query.page);
        if (query.limit)       params.limit        = String(query.limit);

        const type = query.type ?? 'all';

        if (type === 'incident') {
            return { incidents: await this.gateway.listIncidents(params), requests: null };
        }
        if (type === 'request') {
            if (query.companyId) params.companyId = query.companyId;
            return { incidents: null, requests: await this.gateway.listRequests(params) };
        }

        // type === 'all': llamadas en paralelo
        const [incidents, requests] = await Promise.allSettled([
            this.gateway.listIncidents(params),
            this.gateway.listRequests({ ...params, ...(query.companyId ? { companyId: query.companyId } : {}) }),
        ]);

        return {
            incidents: incidents.status === 'fulfilled' ? incidents.value : null,
            requests:  requests.status  === 'fulfilled' ? requests.value  : null,
        };
    }

    getResilienceStatus() {
        return this.gateway.getStatus();
    }
}
