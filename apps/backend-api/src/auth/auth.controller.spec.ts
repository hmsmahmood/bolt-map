import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthController, RegistrationRequestDto } from './auth.controller';
import { AuthWorkflowService } from './auth-workflow.service';

describe('AuthController registration response', () => {
  let controller: AuthController;
  let module: TestingModule | undefined;
  const auth = { register: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    jest.clearAllMocks();
    module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthWorkflowService, useValue: auth }],
    })
      .overrideGuard(AuthGuard)
      .useValue({})
      .compile();
    controller = module.get(AuthController);
  });

  afterEach(async () => {
    await module?.close();
  });

  it('uses the same generic accepted response when registration is deduplicated', async () => {
    const request = Object.assign(Object.create(null), {
      ip: '192.0.2.10',
      get: () => undefined,
    }) as Request;
    const dto = Object.assign(new RegistrationRequestDto(), {
      fullName: 'Sample Rider',
      email: 'rider@example.com',
      mobileNumber: '0123456789',
      countryCode: '+60',
      password: 'StrongPass!234',
      confirmPassword: 'StrongPass!234',
      termsAccepted: true,
    });

    await expect(controller.register(dto, request)).resolves.toEqual({
      message: 'If an account can be created with these details, a verification email will be sent.',
    });
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, AuthController.prototype.register)).toBe(
      HttpStatus.ACCEPTED,
    );
    expect(auth.register).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({ ip: request.ip }),
    );
  });
});
