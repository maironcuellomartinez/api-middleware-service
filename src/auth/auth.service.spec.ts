import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { ClientsService } from '../clients/clients.service';
import { TokenRequestDto } from './dto/token-request.dto';
import { ExternalClientEntity } from '../clients/entities/external-client.entity';

describe('AuthService', () => {
    let service: AuthService;
    let clientsService: jest.Mocked<ClientsService>;
    let jwtService: jest.Mocked<JwtService>;
    let configService: jest.Mocked<ConfigService>;

    const mockClient: ExternalClientEntity = {
        clientId:          'mc_abc123',
        clientSecretHash:  '$2a$10$hash',
        name:              'Test App',
        description:       'A test application',
        isActive:          true,
        createdAt:         new Date('2025-01-01'),
        updatedAt:         new Date('2025-01-01'),
    };

    const clientId = 'mc_abc123';
    const clientSecret = 'supersecret';

    const validDto: TokenRequestDto = {
        grant_type: 'client_credentials',
    };

    beforeEach(async () => {
        clientsService = {
            validateCredentials: jest.fn(),
            create:              jest.fn(),
            findAll:             jest.fn(),
            findOne:             jest.fn(),
            rotateSecret:        jest.fn(),
            deactivate:          jest.fn(),
        } as any;

        jwtService = {
            sign:   jest.fn(),
            verify: jest.fn(),
        } as any;

        configService = {
            get: jest.fn(),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AuthService,
                { provide: ClientsService, useValue: clientsService },
                { provide: JwtService,     useValue: jwtService },
                { provide: ConfigService,  useValue: configService },
            ],
        }).compile();

        service = module.get<AuthService>(AuthService);
    });

    describe('issueToken', () => {
        it('should return a valid TokenResponseDto when credentials are correct', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            configService.get.mockReturnValue(3600);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(clientsService.validateCredentials).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
            );
            expect(jwtService.sign).toHaveBeenCalledWith(
                {
                    sub:        'mc_abc123',
                    type:       'external_client',
                    clientName: 'Test App',
                },
                { expiresIn: 3600 },
            );
            expect(result).toEqual({
                access_token: 'jwt.token.here',
                token_type:   'Bearer',
                expires_in:   3600,
                client_name:  'Test App',
            });
        });

        it('should throw UnauthorizedException when credentials are invalid', async () => {
            clientsService.validateCredentials.mockResolvedValue(null);

            await expect(service.issueToken(clientId, clientSecret, validDto)).rejects.toThrow(
                UnauthorizedException,
            );
            expect(clientsService.validateCredentials).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
            );
        });

        it('should throw UnauthorizedException when client is inactive', async () => {
            clientsService.validateCredentials.mockResolvedValue(null);

            await expect(service.issueToken(clientId, clientSecret, validDto)).rejects.toThrow(
                UnauthorizedException,
            );
        });

        it('should use default expiration when jwt.expiration is not configured', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            configService.get.mockReturnValue(undefined);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.any(Object),
                { expiresIn: 3600 },
            );
            expect(result.expires_in).toBe(3600);
        });

        it('should include client name in JWT payload', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            configService.get.mockReturnValue(3600);
            jwtService.sign.mockReturnValue('jwt.token.here');

            await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({ clientName: 'Test App' }),
                expect.any(Object),
            );
        });

        it('should include clientId as sub in JWT payload', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            configService.get.mockReturnValue(3600);
            jwtService.sign.mockReturnValue('jwt.token.here');

            await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({ sub: 'mc_abc123' }),
                expect.any(Object),
            );
        });

        it('should parse scope string into array in JWT payload and response', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            configService.get.mockReturnValue(3600);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const dtoWithScope: TokenRequestDto = {
                grant_type: 'client_credentials',
                scope:      'read write admin',
            };

            const result = await service.issueToken(clientId, clientSecret, dtoWithScope);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: ['read', 'write', 'admin'],
                }),
                expect.any(Object),
            );
            expect(result.scope).toEqual(['read', 'write', 'admin']);
        });

        it('should handle scope with multiple consecutive spaces', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            configService.get.mockReturnValue(3600);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const dtoWithScope: TokenRequestDto = {
                grant_type: 'client_credentials',
                scope:      'read   write    admin',
            };

            const result = await service.issueToken(clientId, clientSecret, dtoWithScope);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.objectContaining({
                    scope: ['read', 'write', 'admin'],
                }),
                expect.any(Object),
            );
            expect(result.scope).toEqual(['read', 'write', 'admin']);
        });

        it('should omit scope from payload and response when scope is not provided', async () => {
            clientsService.validateCredentials.mockResolvedValue(mockClient);
            configService.get.mockReturnValue(3600);
            jwtService.sign.mockReturnValue('jwt.token.here');

            const result = await service.issueToken(clientId, clientSecret, validDto);

            expect(jwtService.sign).toHaveBeenCalledWith(
                expect.not.objectContaining({ scope: expect.anything() }),
                expect.any(Object),
            );
            expect(result.scope).toBeUndefined();
        });
    });
});
