import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ExternalClientEntity } from './entities/external-client.entity';
import { CreateClientDto, ClientCredentialsResponseDto, ClientResponseDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
    constructor(
        @InjectRepository(ExternalClientEntity) private readonly repo: Repository<ExternalClientEntity>,
    ) { }

    async create(dto: CreateClientDto): Promise<ClientCredentialsResponseDto> {
        const clientId = `mc_${crypto.randomBytes(24).toString('hex')}`;
        const clientSecret = crypto.randomBytes(32).toString('hex');
        const hash = await bcrypt.hash(clientSecret, 10);

        const entity = this.repo.create({
            clientId,
            clientSecretHash: hash,
            name: dto.name,
            description: dto.description,
        });
        await this.repo.save(entity);

        return { clientId, clientSecret, name: dto.name, message: 'Guarda el clientSecret — no se puede recuperar.' };
    }

    async findAll(): Promise<ClientResponseDto[]> {
        const entities = await this.repo.find({ order: { createdAt: 'DESC' } });
        return entities.map(e => this.toDto(e));
    }

    async findOne(clientId: string): Promise<ClientResponseDto> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);
        return this.toDto(entity);
    }

    async rotateSecret(clientId: string): Promise<ClientCredentialsResponseDto> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);

        const clientSecret = crypto.randomBytes(32).toString('hex');
        entity.clientSecretHash = await bcrypt.hash(clientSecret, 10);
        await this.repo.save(entity);

        return { clientId, clientSecret, name: entity.name, message: 'Secret rotado — guarda el nuevo clientSecret.' };
    }

    async deactivate(clientId: string): Promise<void> {
        const entity = await this.repo.findOneBy({ clientId });
        if (!entity) throw new NotFoundException(`Client ${clientId} no encontrado`);
        entity.isActive = false;
        await this.repo.save(entity);
    }

    async validateCredentials(clientId: string, clientSecret: string): Promise<ExternalClientEntity | null> {
        const entity = await this.repo.findOneBy({ clientId, isActive: true });
        if (!entity) return null;
        const valid = await bcrypt.compare(clientSecret, entity.clientSecretHash);
        return valid ? entity : null;
    }

    private toDto(e: ExternalClientEntity): ClientResponseDto {
        return { clientId: e.clientId, name: e.name, description: e.description, isActive: e.isActive, createdAt: e.createdAt };
    }
}
