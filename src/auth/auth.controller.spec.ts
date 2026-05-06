import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, HttpException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenRequestDto, TokenResponseDto } from './dto/token-request.dto';
import { OAuthBulkheadGuard } from './guards/oauth-bulkhead.guard';

describe('AuthController', () => {
    let controller: AuthController;
    let authService: jest.Mocked<AuthService>;

    const mockTokenResponse: TokenResponseDto = {
        access_token: 'jwt.token.here',
        token_type:   'Bearer',
        expires_in:   3600,
        client_name:  'Test App',
    };

    beforeEach(async () => {
        authService = {
            issueToken: jest.fn().mockResolvedValue(mockTokenResponse),
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            controllers: [AuthController],
            providers: [
                { provide: AuthService, useValue: authService },
            ],
        })
            .overrideGuard(OAuthBulkheadGuard)
            .useValue({ canActivate: jest.fn().mockReturnValue(true) })
            .compile();

        controller = module.get<AuthController>(AuthController);
    });

    function mockRequest(overrides: Record<string, any> = {}): any {
        return { __oauthBulkhead: undefined, ...overrides };
    }

    describe('issueToken — Basic Auth', () => {
        it('should extract credentials from Basic Auth header and delegate to service', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('mc_abc123:supersecret').toString('base64');

            const result = await controller.issueToken(
                dto,
                mockRequest(),
                `Basic ${encoded}`,
            );

            expect(authService.issueToken).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
                dto,
            );
            expect(result).toEqual(mockTokenResponse);
        });

        it('should pass scope from body to service', async () => {
            const dto: TokenRequestDto = {
                grant_type: 'client_credentials',
                scope:      'read write admin',
            };
            const encoded = Buffer.from('mc_abc123:supersecret').toString('base64');

            await controller.issueToken(dto, mockRequest(), `Basic ${encoded}`);

            expect(authService.issueToken).toHaveBeenCalledWith(
                'mc_abc123',
                'supersecret',
                expect.objectContaining({ scope: 'read write admin' }),
            );
        });

        it('should pass through bulkhead when present in request', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('mc_abc123:supersecret').toString('base64');
            const mockBulkhead = {
                execute: jest.fn().mockImplementation((fn: any) => fn()),
            };
            const req = mockRequest({ __oauthBulkhead: mockBulkhead });

            const result = await controller.issueToken(dto, req, `Basic ${encoded}`);

            expect(mockBulkhead.execute).toHaveBeenCalled();
            expect(result).toEqual(mockTokenResponse);
        });

        it('should throw UnauthorizedException when Basic Auth header is malformed', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };

            await expect(
                controller.issueToken(dto, mockRequest(), 'Basic not-base64!!!'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when Basic Auth header has no colon separator', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('invalid-no-colon').toString('base64');

            await expect(
                controller.issueToken(dto, mockRequest(), `Basic ${encoded}`),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when no credentials provided at all', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };

            await expect(
                controller.issueToken(dto, mockRequest()),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when Basic Auth header is not Basic scheme', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };

            await expect(
                controller.issueToken(dto, mockRequest(), 'Bearer some-token'),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should handle Basic Auth with empty password after colon', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('mc_abc123:').toString('base64');

            await expect(
                controller.issueToken(dto, mockRequest(), `Basic ${encoded}`),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should handle Basic Auth with empty client_id before colon', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from(':supersecret').toString('base64');

            await expect(
                controller.issueToken(dto, mockRequest(), `Basic ${encoded}`),
            ).rejects.toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when client_id does not start with mc_', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('invalid_client:supersecret').toString('base64');

            await expect(
                controller.issueToken(dto, mockRequest(), `Basic ${encoded}`),
            ).rejects.toThrow(
                new UnauthorizedException('Formato de client_id invalido — debe comenzar con mc_'),
            );
        });

        it('should catch BulkheadRejectedError and throw HttpException(429)', async () => {
            const dto: TokenRequestDto = { grant_type: 'client_credentials' };
            const encoded = Buffer.from('mc_abc123:supersecret').toString('base64');
            const { BulkheadRejectedError } = await import('../recilience/bulkhead/bulkhead');
            const mockBulkhead = {
                execute: jest.fn().mockRejectedValue(new BulkheadRejectedError('Bulkhead is full')),
            };
            const req = mockRequest({ __oauthBulkhead: mockBulkhead });

            await expect(
                controller.issueToken(dto, req, `Basic ${encoded}`),
            ).rejects.toThrow(
                new HttpException(
                    {
                        statusCode: 429,
                        error:      'Too Many Requests',
                        message:    'Demasiados intentos de autenticacion. Intente nuevamente en unos segundos.',
                    },
                    429,
                ),
            );
        });
    });
});
