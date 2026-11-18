import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupabaseService } from '../services/supabase.service';
import { PetDetailComponent } from './pet-detail.component';

describe('PetDetailComponent', () => {
  it('rejects letters in a contact phone while accepting common international formatting', async () => {
    await TestBed.configureTestingModule({
      imports: [PetDetailComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: () => 'pet-id' },
              queryParamMap: { get: () => null },
            },
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getPetById: () => of(null),
            getPetNotes: () => of([]),
            getUpcomingPetAppointments: () => of([]),
            getPetWalkHistory: () => of([]),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PetDetailComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.profileForm.controls.contact_phone.setValue('555-CALL-ME');
    expect(component.profileForm.controls.contact_phone.invalid).toBe(true);

    component.profileForm.controls.contact_phone.setValue('+52 (555) 123-4567');
    expect(component.profileForm.controls.contact_phone.valid).toBe(true);
  });
});
