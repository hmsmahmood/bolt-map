export type VehicleType = 'car' | 'motorcycle' | 'truck';

export interface VehicleProfile {
  id: string;
  userId: string;
  name: string;
  vehicleType: VehicleType;
  make: string;
  model: string;
  modelYear: number | null;
  registrationNumber: string | null;
  maxWeightKg: number | null;
  maxHeightCm: number | null;
  maxLengthCm: number | null;
  createdAt: string;
  updatedAt: string;
}

export type VehicleProfileWrite = Pick<
  VehicleProfile,
  'name' | 'vehicleType' | 'make' | 'model'
> &
  Partial<
    Pick<
      VehicleProfile,
      | 'modelYear'
      | 'registrationNumber'
      | 'maxWeightKg'
      | 'maxHeightCm'
      | 'maxLengthCm'
    >
  >;
