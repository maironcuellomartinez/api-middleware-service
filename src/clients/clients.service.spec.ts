import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ClientsService } from './clients.service';
import { ExternalClientEntity } from './entities/external-client.entity';
import { CreateClientDto } from './dto/create-client.dto';

// Mock de bcrypt para evitar el costo real de hashing
jest.mock('bcrypt', () => ({
    hash:    jest.fn(),
    compare: jest.fn(),
}));

// Mock de crypto.randomBytes para tener valores predecibles
const mockRandomBytes = jest.fn();
jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    randomBytes: (...args: any[]) => mockRandomBytes(...args),
}));

// Helper: genera un string hex de longitud determinada a partir de un byte repetido
function hexFromByte(byte: number, length: number): string {
    return Buffer.alloc(length, byte).toString('hex');
}

describe('ClientsService', () => {
    let service: ClientsService;
    let repo: jest.Mocked<Repository<ExternalClientEntity>>;

    function createMockEntity(overrides?: Partial<ExternalClientEntity>): ExternalClientEntity {
        return {
            clientId:               'mc_abc123',
            clientSecretHash:       '$2a$10$hashedsecret',
            name:                   'Test App',
            description:            'A test app',
            tokenExpiresInSeconds:  3600,
            allowedScopes:          null,
            isActive:               true,
            createdAt:              new Date('2025-01-01'),
            updatedAt:              new Date('2025-01-01'),
            ...overrides,
        };
    }

    beforeEach(async () => {
        repo = {
            create:      jest.fn(),
            save:        jest.fn(),
            find:        jest.fn(),
            findOneBy:   jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ClientsService,
                {
                    provide: getRepositoryToken(ExternalClientEntity),
                    useValue: repo,
                },
            ],
        }).compile();

        service = module.get<ClientsService>(ClientsService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('create', () => {
        const dto: CreateClientDto = { name: 'New App', description: 'Description' };

        afterEach(() => {
            mockRandomBytes.mockReset();
        });

        it('should create a client and return credentials', async () => {
            mockRandomBytes
                .mockReturnValueOnce(Buffer.alloc(24, 0x61))  // clientId → hex: 6161...
                .mockReturnValueOnce(Buffer.alloc(32, 0x62)); // clientSecret → hex: 6262...

            (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$hashed');

            const entity = createMockEntity();
            repo.create.mockReturnValue(entity);
            repo.save.mockResolvedValue(entity);

            const result = await service.create(dto);

            expect(mockRandomBytes).toHaveBeenCalledTimes(2);
            expect(bcrypt.hash).toHaveBeenCalledWith(
                hexFromByte(0x62, 32),
                10,
            );
            expect(repo.create).toHaveBeenCalledWith({
                clientId:               'mc_' + hexFromByte(0x61, 24),
                clientSecretHash:       '$2a$10$hashed',
                name:                   'New App',
                description:            'Description',
                tokenExpiresInSeconds:  3600,
            });
            expect(repo.save).toHaveBeenCalledWith(entity);
            expect(result).toEqual({
                clientId:     'mc_' + hexFromByte(0x61, 24),
                clientSecret: hexFromByte(0x62, 32),
                name:         'New App',
                message:      'Guarda el clientSecret — no se puede recuperar.',
            });
        });

        it('should create a client without description', async () => {
            const dtoNoDesc: CreateClientDto = { name: 'Minimal App' };

            mockRandomBytes
                .mockReturnValueOnce(Buffer.alloc(24, 0x63))  // clientId → hex: 6363...
                .mockReturnValueOnce(Buffer.alloc(32, 0x64)); // clientSecret → hex: 6464...

            (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$hashed');

            const entityNoDesc = createMockEntity({ description: null });
            repo.create.mockReturnValue(entityNoDesc);
            repo.save.mockResolvedValue(entityNoDesc);

            const result = await service.create(dtoNoDesc);

            expect(repo.create).toHaveBeenCalledWith({
                clientId:               'mc_' + hexFromByte(0x63, 24),
                clientSecretHash:       '$2a$10$hashed',
                name:                   'Minimal App',
                description:            undefined,
                tokenExpiresInSeconds:  3600,
            });
            expect(result.name).toBe('Minimal App');
        });

        it('should create a client with custom tokenExpiresInSeconds', async () => {
            const dtoCustomExp: CreateClientDto = {
                name: 'Custom Exp App',
                description: 'App with custom token expiration',
                tokenExpiresInSeconds: 7200,
            };

            mockRandomBytes
                .mockReturnValueOnce(Buffer.alloc(24, 0x65))  // clientId
                .mockReturnValueOnce(Buffer.alloc(32, 0x66)); // clientSecret

            (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$hashed');

            const entity = createMockEntity({
                clientId: 'mc_' + hexFromByte(0x65, 24),
                name: 'Custom Exp App',
                description: 'App with custom token expiration',
                tokenExpiresInSeconds: 7200,
            });
            repo.create.mockReturnValue(entity);
            repo.save.mockResolvedValue(entity);

            const result = await service.create(dtoCustomExp);

            expect(repo.create).toHaveBeenCalledWith({
                clientId:               'mc_' + hexFromByte(0x65, 24),
                clientSecretHash:       '$2a$10$hashed',
                name:                   'Custom Exp App',
                description:            'App with custom token expiration',
                tokenExpiresInSeconds:  7200,
            });
            expect(result.name).toBe('Custom Exp App');
        });

        it('should default tokenExpiresInSeconds to 3600 when not provided', async () => {
            mockRandomBytes
                .mockReturnValueOnce(Buffer.alloc(24, 0x67))
                .mockReturnValueOnce(Buffer.alloc(32, 0x68));

            (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$hashed');

            const entity = createMockEntity({
                clientId: 'mc_' + hexFromByte(0x67, 24),
                name: 'Default Exp App',
                tokenExpiresInSeconds: 3600,
            });
            repo.create.mockReturnValue(entity);
            repo.save.mockResolvedValue(entity);

            await service.create({ name: 'Default Exp App' });

            expect(repo.create).toHaveBeenCalledWith(
                expect.objectContaining({ tokenExpiresInSeconds: 3600 }),
            );
        });
    });

    describe('findAll', () => {
        it('should return all clients ordered by createdAt DESC', async () => {
            const entities = [
                createMockEntity({ clientId: 'mc_001', name: 'App 1', createdAt: new Date('2025-02-01') }),
                createMockEntity({ clientId: 'mc_002', name: 'App 2', createdAt: new Date('2025-01-01') }),
            ];
            repo.find.mockResolvedValue(entities as ExternalClientEntity[]);

            const result = await service.findAll();

            expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
            expect(result).toHaveLength(2);
            expect(result[0].clientId).toBe('mc_001');
            expect(result[1].clientId).toBe('mc_002');
        });

        it('should return empty array when no clients exist', async () => {
            repo.find.mockResolvedValue([]);

            const result = await service.findAll();

            expect(result).toEqual([]);
        });

        it('should include tokenExpiresInSeconds in each response', async () => {
            const entities = [
                createMockEntity({ clientId: 'mc_001', tokenExpiresInSeconds: 7200 }),
                createMockEntity({ clientId: 'mc_002', tokenExpiresInSeconds: 3600 }),
            ];
            repo.find.mockResolvedValue(entities as ExternalClientEntity[]);

            const result = await service.findAll();

            expect(result[0].tokenExpiresInSeconds).toBe(7200);
            expect(result[1].tokenExpiresInSeconds).toBe(3600);
        });
    });

    describe('findOne', () => {
        it('should return a client by clientId', async () => {
            const entity = createMockEntity();
            repo.findOneBy.mockResolvedValue(entity);

            const result = await service.findOne('mc_abc123');

            expect(repo.findOneBy).toHaveBeenCalledWith({ clientId: 'mc_abc123' });
            expect(result.clientId).toBe('mc_abc123');
            expect(result.name).toBe('Test App');
        });

        it('should throw NotFoundException when client does not exist', async () => {
            repo.findOneBy.mockResolvedValue(null);

            await expect(service.findOne('mc_nonexistent')).rejects.toThrow(NotFoundException);
            await expect(service.findOne('mc_nonexistent')).rejects.toThrow(
                'Client mc_nonexistent no encontrado',
            );
        });

        it('should include tokenExpiresInSeconds in response', async () => {
            const entity = createMockEntity({ tokenExpiresInSeconds: 14400 });
            repo.findOneBy.mockResolvedValue(entity);

            const result = await service.findOne('mc_abc123');

            expect(result.tokenExpiresInSeconds).toBe(14400);
        });
    });

    describe('rotateSecret', () => {
        it('should rotate the client secret and return new credentials', async () => {
            const entity = createMockEntity();
            repo.findOneBy.mockResolvedValue(entity);
            mockRandomBytes.mockReturnValue(Buffer.alloc(32, 0x65));
            (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$10$newhash');
            repo.save.mockResolvedValue({ ...entity, clientSecretHash: '$2a$10$newhash' });

            const result = await service.rotateSecret('mc_abc123');

            expect(bcrypt.hash).toHaveBeenCalledWith(
                hexFromByte(0x65, 32),
                10,
            );
            expect(repo.save).toHaveBeenCalledWith(
                expect.objectContaining({ clientSecretHash: '$2a$10$newhash' }),
            );
            expect(result).toEqual({
                clientId:     'mc_abc123',
                clientSecret: hexFromByte(0x65, 32),
                name:         'Test App',
                message:      'Secret rotado — guarda el nuevo clientSecret.',
            });
        });

        it('should throw NotFoundException when client does not exist', async () => {
            repo.findOneBy.mockResolvedValue(null);

            await expect(service.rotateSecret('mc_nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    describe('deactivate', () => {
        it('should set isActive to false', async () => {
            const entity = createMockEntity({ isActive: true });
            repo.findOneBy.mockResolvedValue(entity);
            repo.save.mockResolvedValue({ ...entity, isActive: false });

            await service.deactivate('mc_abc123');

            expect(entity.isActive).toBe(false);
            expect(repo.save).toHaveBeenCalledWith(entity);
        });

        it('should throw NotFoundException when client does not exist', async () => {
            repo.findOneBy.mockResolvedValue(null);

            await expect(service.deactivate('mc_nonexistent')).rejects.toThrow(NotFoundException);
        });
    });

    describe('validateCredentials', () => {
        it('should return the entity when credentials are valid', async () => {
            const entity = createMockEntity();
            repo.findOneBy.mockResolvedValue(entity);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);

            const result = await service.validateCredentials('mc_abc123', 'correct-secret');

            expect(repo.findOneBy).toHaveBeenCalledWith({
                clientId: 'mc_abc123',
                isActive: true,
            });
            expect(bcrypt.compare).toHaveBeenCalledWith(
                'correct-secret',
                '$2a$10$hashedsecret',
            );
            expect(result).toEqual(entity);
        });

        it('should return null when client is not found', async () => {
            repo.findOneBy.mockResolvedValue(null);

            const result = await service.validateCredentials('mc_nonexistent', 'secret');

            expect(result).toBeNull();
        });

        it('should return null when client is inactive', async () => {
            repo.findOneBy.mockResolvedValue(null); // isActive: true filter excludes inactive

            const result = await service.validateCredentials('mc_inactive', 'secret');

            expect(result).toBeNull();
        });

        it('should return null when password does not match', async () => {
            const entity = createMockEntity();
            repo.findOneBy.mockResolvedValue(entity);
            (bcrypt.compare as jest.Mock).mockResolvedValue(false);

            const result = await service.validateCredentials('mc_abc123', 'wrong-secret');

            expect(result).toBeNull();
        });
    });
});
