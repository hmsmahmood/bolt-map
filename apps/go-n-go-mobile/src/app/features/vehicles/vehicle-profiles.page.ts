import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonToolbar,
} from '@ionic/angular/standalone';
import { ApiService } from '../../core/api/api.service';
import {
  VehicleProfile,
  VehicleProfileWrite,
  VehicleType,
} from '../../core/api/vehicle-profile.model';
import { TranslationService } from '../../core/i18n/translation.service';

type VehicleForm = FormGroup<{
  name: FormControl<string>;
  vehicleType: FormControl<VehicleType>;
  make: FormControl<string>;
  model: FormControl<string>;
  modelYear: FormControl<string | number>;
  registrationNumber: FormControl<string>;
  maxWeightKg: FormControl<string | number>;
  maxHeightCm: FormControl<string | number>;
  maxLengthCm: FormControl<string | number>;
}>;

@Component({
  selector: 'gng-vehicle-profiles',
  standalone: true,
  imports: [
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonToolbar,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './vehicle-profiles.page.html',
  styleUrl: './vehicle-profiles.page.scss',
})
export class VehicleProfilesPage implements OnInit {
  readonly i18n = inject(TranslationService);
  readonly profiles = signal<VehicleProfile[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly formOpen = signal(false);
  readonly confirmingDeleteId = signal<string | null>(null);
  readonly error = signal('');
  readonly form: VehicleForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(60),
      ],
    }),
    vehicleType: new FormControl<VehicleType>('car', { nonNullable: true }),
    make: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(60),
      ],
    }),
    model: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(60),
      ],
    }),
    modelYear: new FormControl<string | number>('', {
      nonNullable: true,
      validators: [Validators.pattern(/^\d*$/), Validators.min(1900), Validators.max(2100)],
    }),
    registrationNumber: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(20)],
    }),
    maxWeightKg: new FormControl<string | number>('', {
      nonNullable: true,
      validators: [Validators.pattern(/^\d*$/), Validators.min(1), Validators.max(100000)],
    }),
    maxHeightCm: new FormControl<string | number>('', {
      nonNullable: true,
      validators: [Validators.pattern(/^\d*$/), Validators.min(1), Validators.max(1000)],
    }),
    maxLengthCm: new FormControl<string | number>('', {
      nonNullable: true,
      validators: [Validators.pattern(/^\d*$/), Validators.min(1), Validators.max(3000)],
    }),
  });

  private readonly api = inject(ApiService);

  ngOnInit(): void {
    void this.loadProfiles();
  }

  async loadProfiles(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.profiles.set(await firstValueFrom(this.api.getVehicleProfiles()));
    } catch {
      this.error.set(this.i18n.text('vehicleLoadFailed'));
    } finally {
      this.loading.set(false);
    }
  }

  beginCreate(): void {
    this.editingId.set(null);
    this.formOpen.set(true);
    this.form.reset({ vehicleType: 'car' });
    this.error.set('');
  }

  beginEdit(profile: VehicleProfile): void {
    this.editingId.set(profile.id);
    this.formOpen.set(true);
    this.confirmingDeleteId.set(null);
    this.form.reset({
      name: profile.name,
      vehicleType: profile.vehicleType,
      make: profile.make,
      model: profile.model,
      modelYear: this.numberText(profile.modelYear),
      registrationNumber: profile.registrationNumber ?? '',
      maxWeightKg: this.numberText(profile.maxWeightKg),
      maxHeightCm: this.numberText(profile.maxHeightCm),
      maxLengthCm: this.numberText(profile.maxLengthCm),
    });
    this.error.set('');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.formOpen.set(false);
    this.form.reset({ vehicleType: 'car' });
    this.error.set('');
  }

  async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(this.i18n.text('validationError'));
      return;
    }

    this.saving.set(true);
    this.error.set('');
    const profile = this.toWritePayload();
    try {
      const editingId = this.editingId();
      if (editingId) {
        await firstValueFrom(this.api.updateVehicleProfile(editingId, profile));
      } else {
        await firstValueFrom(this.api.createVehicleProfile(profile));
      }
      this.cancelEdit();
      await this.loadProfiles();
    } catch {
      this.error.set(this.i18n.text('vehicleSaveFailed'));
    } finally {
      this.saving.set(false);
    }
  }

  async deleteProfile(id: string): Promise<void> {
    if (this.confirmingDeleteId() !== id) {
      this.confirmingDeleteId.set(id);
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.api.deleteVehicleProfile(id));
      this.confirmingDeleteId.set(null);
      if (this.editingId() === id) {
        this.cancelEdit();
      }
      await this.loadProfiles();
    } catch (error: unknown) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? this.i18n.text('vehicleNotFound')
          : this.i18n.text('vehicleDeleteFailed'),
      );
    }
  }

  cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  vehicleTypeLabel(type: VehicleType): string {
    return this.i18n.text(`vehicleType_${type}`);
  }

  private toWritePayload(): VehicleProfileWrite {
    const value = this.form.getRawValue();
    return {
      name: value.name.trim(),
      vehicleType: value.vehicleType,
      make: value.make.trim(),
      model: value.model.trim(),
      modelYear: this.optionalNumber(value.modelYear),
      registrationNumber: value.registrationNumber.trim() || undefined,
      maxWeightKg: this.optionalNumber(value.maxWeightKg),
      maxHeightCm: this.optionalNumber(value.maxHeightCm),
      maxLengthCm: this.optionalNumber(value.maxLengthCm),
    };
  }

  private optionalNumber(value: string | number): number | undefined {
    return typeof value === 'string' && !value.trim()
      ? undefined
      : Number(value);
  }

  private numberText(value: number | null): string {
    return value === null ? '' : String(value);
  }
}
