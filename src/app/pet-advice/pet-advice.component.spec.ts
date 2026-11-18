import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PetAdviceComponent } from './pet-advice.component';

describe('PetAdviceComponent', () => {
  let fixture: ComponentFixture<PetAdviceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PetAdviceComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PetAdviceComponent);
    fixture.detectChanges();
  });

  it('shows the initial greeting and displays advice after submitting a question', () => {
    const component = fixture.componentInstance;
    component.question = '¿Qué hago con el calor?';
    component.sendQuestion();
    fixture.detectChanges();

    const pageText = fixture.nativeElement.textContent as string;
    expect(pageText).toContain('Puedo darte consejos generales');
    expect(pageText).toContain('¿Qué hago con el calor?');
    expect(pageText).toContain('horas frescas');
    expect(component.question).toBe('');
  });

  it('shows a validation error instead of sending a question over the limit', () => {
    const component = fixture.componentInstance;
    component.question = 'a'.repeat(component.maxLength + 1);
    component.sendQuestion();
    fixture.detectChanges();

    expect(component.inputError).toContain('500 caracteres');
    expect(fixture.nativeElement.textContent).toContain('500 caracteres');
  });
});
