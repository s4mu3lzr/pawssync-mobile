import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AdviceMessage {
  id: number;
  role: 'assistant' | 'user';
  content: string;
  createdAt: Date;
}

@Injectable({ providedIn: 'root' })
export class PetAdviceService {
  private nextId = 1;
  private readonly messagesSubject = new BehaviorSubject<AdviceMessage[]>([
    {
      id: this.nextId++,
      role: 'assistant',
      content: '¡Hola! Puedo darte consejos generales para un paseo seguro. ¿Qué te gustaría saber?',
      createdAt: new Date(),
    },
  ]);

  readonly messages$ = this.messagesSubject.asObservable();

  ask(question: string): void {
    const text = question.trim();
    if (!text || text.length > 500) {
      throw new RangeError('La pregunta debe tener entre 1 y 500 caracteres.');
    }

    const now = new Date();
    this.messagesSubject.next([
      ...this.messagesSubject.value,
      { id: this.nextId++, role: 'user', content: text, createdAt: now },
      { id: this.nextId++, role: 'assistant', content: this.getAdvice(text), createdAt: new Date() },
    ]);
  }

  private getAdvice(question: string): string {
    const normalized = question
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (/veterin|herida|vomit|diarrea|convulsion|respir/.test(normalized)) {
      return 'No puedo evaluar síntomas ni sustituir a un veterinario. Si notas una lesión, dificultad para respirar, convulsiones u otro signo preocupante, detén el paseo y contacta cuanto antes a un profesional veterinario.';
    }
    if (/calor|caliente|temperatura|sol/.test(normalized)) {
      return 'En días calurosos, elige horas frescas y sombra, lleva agua y evita el asfalto caliente. Si jadea en exceso, se debilita o parece desorientado, detén el paseo, llévalo a un lugar fresco y consulta a un veterinario.';
    }
    if (/agua|hidrata|sed/.test(normalized)) {
      return 'Lleva agua fresca y ofrece pausas para beber, especialmente en paseos largos o días cálidos. Sigue las indicaciones del dueño sobre la rutina y las necesidades de la mascota.';
    }
    if (/frio|fria|invierno/.test(normalized)) {
      return 'Con frío o lluvia, adapta la duración al tamaño, edad y comodidad de la mascota. Usa abrigo solo si el dueño lo recomienda y sécala al volver.';
    }
    if (/pata|patas|asfalto|pavimento/.test(normalized)) {
      return 'Antes de caminar sobre pavimento, comprueba que no esté demasiado caliente; prefiere rutas con sombra y superficies seguras. Al regresar, revisa las patas y avisa al dueño si observas una lesión.';
    }
    if (/correa|tirar|arnes/.test(normalized)) {
      return 'Revisa que el arnés o collar esté bien ajustado y la correa no esté dañada. Mantén una distancia segura de bicicletas y vehículos; no tires ni castigues a la mascota.';
    }
    if (/ansiedad|miedo|nervios|asusta/.test(normalized)) {
      return 'Mantén distancia de lo que le asusta, busca un lugar tranquilo y prémialo con calma si el dueño autorizó premios. No lo fuerces a acercarse; consulta al dueño si el malestar continúa.';
    }
    if (/comida|comer|premio|snack/.test(normalized)) {
      return 'No le des comida ni premios sin autorización del dueño: podría tener alergias o una dieta especial. Lleva solo lo que el dueño haya indicado.';
    }
    if (/perro|social|parque|otro animal/.test(normalized)) {
      return 'Pregunta al dueño si la mascota puede acercarse a otros animales. Mantén control de la correa y respeta el espacio de las personas y mascotas que encuentres.';
    }

    return 'Antes de salir, confirma con el dueño la ruta, duración y cuidados especiales. Lleva correa, bolsas y agua; mantén identificación visible y comparte cualquier incidente con el dueño al terminar.';
  }
}
