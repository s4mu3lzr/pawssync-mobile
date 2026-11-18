import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { PetAdviceService } from './pet-advice.service';

describe('PetAdviceService', () => {
  let service: PetAdviceService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PetAdviceService);
  });

  it('reactively appends a question, a timestamped answer and topic-specific safety advice', async () => {
    service.ask('¿Qué hago con el calor?');

    const messages = await firstValueFrom(service.messages$);
    expect(messages).toHaveLength(3);
    expect(messages[1].role).toBe('user');
    expect(messages[1].createdAt).toBeInstanceOf(Date);
    expect(messages[2].content).toContain('horas frescas');
    expect(messages[2].content).toContain('veterinario');
  });

  it('does not accept blank or oversized questions', () => {
    expect(() => service.ask('   ')).toThrowError(RangeError);
    expect(() => service.ask('a'.repeat(501))).toThrowError(RangeError);
  });

  it('routes health concerns to a veterinarian instead of diagnosing', async () => {
    service.ask('Mi perro tiene dificultad para respirar');

    const messages = await firstValueFrom(service.messages$);
    expect(messages[2].content.toLocaleLowerCase('es')).toContain('no puedo evaluar síntomas');
    expect(messages[2].content).toContain('profesional veterinario');
  });
});
