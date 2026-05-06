import { Injectable } from '@nestjs/common';
import { GatewayClient } from '../gateway/gateway.client';
import { ListRequestsDto } from './dto/list-records.dto';

@Injectable()
export class RecordsService {
    constructor(private readonly gateway: GatewayClient) {}

    getRequestByNumber(number: string) {
        return this.gateway.getRequestByNumber(number);
    }

    listRequests(query: ListRequestsDto) {
        const params: Record<string, string> = {};
        if (query.status)      params.status      = query.status;
        if (query.issueTypeId) params.issueTypeId = query.issueTypeId;
        if (query.cornerId)    params.cornerId    = query.cornerId;
        if (query.companyId)   params.companyId   = query.companyId;
        if (query.dateFrom)    params.dateFrom    = query.dateFrom;
        if (query.dateTo)      params.dateTo      = query.dateTo;
        if (query.page)        params.page        = String(query.page);
        if (query.limit)       params.limit       = String(query.limit);

        return this.gateway.listRequests(params);
    }

    getResilienceStatus() {
        return this.gateway.getStatus();
    }
}
