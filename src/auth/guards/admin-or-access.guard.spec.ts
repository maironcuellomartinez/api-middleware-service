import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminOrAccessGuard, JWT_ADMIN_SERVICE, JWT_AUTH_SERVICE } from './admin-or-access.guard';

describe('AdminOrAccessGuard', () => {
    let guard: AdminOrAccessGuard;
    let adminJwt: jest.Mocked<JwtService>;
    let authJwt: jest.Mocked<JwtService>;

    const makeRequest = (opts: { cookie?: string; bearer?: string } = {}) => ({
        headers: {
            cookie:        opts.cookie ? `admin_session=${opts.cookie}` : undefined,
            authorization: opts.bearer ? `Bearer ${opts.bearer}` : undefined,
        },
    }) as any;

    const makeCtx = (req: any) => ({
        switchToHttp: () => ({ getRequest: () => req }),
    }) as any;

    beforeEach(() => {
        adminJwt = { verify: jest.fn() } as any;
        authJwt  = { verify: jest.fn() } as any;
        guard    = new AdminOrAccessGuard(adminJwt, authJwt);
    });

    describe('admin cookie path', () => {
        it('should return true and inject adminUser for a valid admin_session cookie', () => {
            const req = makeRequest({ cookie: 'valid.admin.token' });
            adminJwt.verify.mockReturnValue({ username: 'admin' });

            const result = guard.canActivate(makeCtx(req));

            expect(result).toBe(true);
            expect(req.adminUser).toEqual({ username: 'admin' });
            expect(adminJwt.verify).toHaveBeenCalledWith('valid.admin.token');
        });

        it('should fall through to bearer when cookie verification fails', () => {
            const req = makeRequest({ cookie: 'bad.cookie', bearer: 'valid.bearer' });
            adminJwt.verify.mockImplementation(() => { throw new Error('invalid'); });
            authJwt.verify.mockReturnValue({ sub: 'mc_abc', type: 'external_client', clientName: 'App' });

            const result = guard.canActivate(makeCtx(req));

            expect(result).toBe(true);
            expect(req.externalClient).toBeDefined();
        });
    });

    describe('bearer token path', () => {
        it('should return true and inject externalClient for a valid Bearer token', () => {
            const req = makeRequest({ bearer: 'valid.bearer.token' });
            authJwt.verify.mockReturnValue({ sub: 'mc_abc123', type: 'external_client', clientName: 'My App' });

            const result = guard.canActivate(makeCtx(req));

            expect(result).toBe(true);
            expect(req.externalClient).toEqual({ clientId: 'mc_abc123', clientName: 'My App' });
        });

        it('should throw UnauthorizedException when bearer token type is not external_client', () => {
            const req = makeRequest({ bearer: 'wrong.type.token' });
            authJwt.verify.mockReturnValue({ sub: 'mc_abc123', type: 'admin', clientName: 'App' });

            expect(() => guard.canActivate(makeCtx(req))).toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when bearer token is expired', () => {
            const req = makeRequest({ bearer: 'expired.token' });
            authJwt.verify.mockImplementation(() => { throw new Error('jwt expired'); });

            expect(() => guard.canActivate(makeCtx(req))).toThrow(UnauthorizedException);
        });

        it('should re-throw UnauthorizedException directly without wrapping', () => {
            const req = makeRequest({ bearer: 'some.token' });
            authJwt.verify.mockImplementation(() => {
                throw new UnauthorizedException('Token no pertenece a una aplicacion externa');
            });

            expect(() => guard.canActivate(makeCtx(req))).toThrow('Token no pertenece a una aplicacion externa');
        });
    });

    describe('no auth', () => {
        it('should throw UnauthorizedException when neither cookie nor bearer is present', () => {
            const req = makeRequest();

            expect(() => guard.canActivate(makeCtx(req))).toThrow(UnauthorizedException);
        });

        it('should throw UnauthorizedException when Authorization header is not Bearer', () => {
            const req = makeRequest();
            (req as any).headers.authorization = 'Basic dXNlcjpwYXNz';

            expect(() => guard.canActivate(makeCtx(req))).toThrow(UnauthorizedException);
        });
    });
});
