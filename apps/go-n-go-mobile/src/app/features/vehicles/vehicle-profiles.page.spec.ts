import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { VehicleProfile } from '../../core/api/vehicle-profile.model';
import { TranslationService } from '../../core/i18n/translation.service';
import { VehicleProfilesPage } from './vehicle-profiles.page';

describe('VehicleProfilesPage', () => {
  let api: jasmine.SpyObj<ApiService>;
  let page: VehicleProfilesPage;

  const profile: VehicleProfile = {
    id: 'vehicle-1',
    userId: 'user-1',
    name: 'Daily car',
    vehicleType: 'car',
    make: 'Perodua',
    model: 'Myvi',
    modelYear: 2024,
    registrationNumber: null,
    maxWeightKg: null,
    maxHeightCm: null,
    maxLengthCm: null,
    createdAt: '2026-11-04T00:00:00.000Z',
    updatedAt: '2026-11-04T00:00:00.000Z',
  };

  beforeEach(() => {
    api = jasmine.createSpyObj<ApiService>('ApiService', [
      'getVehicleProfiles',
      'createVehicleProfile',
      'updateVehicleProfile',
      'deleteVehicleProfile',
    ]);
    api.getVehicleProfiles.and.returnValue(of([profile]));
    api.createVehicleProfile.and.returnValue(of(profile));
    api.updateVehicleProfile.and.returnValue(of(profile));
    api.deleteVehicleProfile.and.returnValue(of(void 0));

    TestBed.configureTestingModule({
      imports: [VehicleProfilesPage],
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: TranslationService, useValue: { text: (key: string) => key } },
      ],
    });

    page = TestBed.createComponent(VehicleProfilesPage).componentInstance;
  });

  it('loads the signed-in user vehicle list through the API client', async () => {
    await page.loadProfiles();

    expect(api.getVehicleProfiles).toHaveBeenCalledTimes(1);
    expect(page.profiles()).toEqual([profile]);
  });

  it('creates a validated vehicle profile with optional numeric capabilities', async () => {
    page.beginCreate();
    page.form.setValue({
      name: 'Work truck',
      vehicleType: 'truck',
      make: 'Isuzu',
      model: 'N-Series',
      modelYear: '2022',
      registrationNumber: 'WXY1234',
      maxWeightKg: '7500',
      maxHeightCm: '320',
      maxLengthCm: '',
    });

    await page.save();

    expect(api.createVehicleProfile).toHaveBeenCalledWith({
      name: 'Work truck',
      vehicleType: 'truck',
      make: 'Isuzu',
      model: 'N-Series',
      modelYear: 2022,
      registrationNumber: 'WXY1234',
      maxWeightKg: 7500,
      maxHeightCm: 320,
      maxLengthCm: undefined,
    });
    expect(page.formOpen()).toBeFalse();
  });

  it('serializes numeric input values emitted by Ionic number inputs', async () => {
    page.beginCreate();
    page.form.setValue({
      name: 'Integration car',
      vehicleType: 'car',
      make: 'Perodua',
      model: 'Myvi',
      modelYear: 2024,
      registrationNumber: '',
      maxWeightKg: 1200,
      maxHeightCm: '',
      maxLengthCm: '',
    });

    await page.save();

    expect(api.createVehicleProfile).toHaveBeenCalledWith({
      name: 'Integration car',
      vehicleType: 'car',
      make: 'Perodua',
      model: 'Myvi',
      modelYear: 2024,
      registrationNumber: undefined,
      maxWeightKg: 1200,
      maxHeightCm: undefined,
      maxLengthCm: undefined,
    });
  });

  it('updates and deletes profiles only after an explicit delete confirmation', async () => {
    page.beginEdit(profile);
    page.form.controls.name.setValue('Family car');
    await page.save();
    expect(api.updateVehicleProfile).toHaveBeenCalledWith('vehicle-1', {
      name: 'Family car',
      vehicleType: 'car',
      make: 'Perodua',
      model: 'Myvi',
      modelYear: 2024,
      registrationNumber: undefined,
      maxWeightKg: undefined,
      maxHeightCm: undefined,
      maxLengthCm: undefined,
    });

    await page.deleteProfile('vehicle-1');
    expect(api.deleteVehicleProfile).not.toHaveBeenCalled();
    await page.deleteProfile('vehicle-1');
    expect(api.deleteVehicleProfile).toHaveBeenCalledWith('vehicle-1');
  });
});
