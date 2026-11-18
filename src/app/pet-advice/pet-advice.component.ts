import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { sendOutline } from 'ionicons/icons';
import { PetAdviceService } from '../services/pet-advice.service';

@Component({
  selector: 'app-pet-advice',
  standalone: true,
  templateUrl: './pet-advice.component.html',
  styleUrl: './pet-advice.component.scss',
  imports: [AsyncPipe, DatePipe, FormsModule, IonButton, IonContent, IonIcon],
})
export class PetAdviceComponent {
  private readonly advice = inject(PetAdviceService);
  readonly messages$ = this.advice.messages$;
  readonly maxLength = 500;
  question = '';
  inputError = '';

  constructor() {
    addIcons({ sendOutline });
  }

  sendQuestion(): void {
    const text = this.question.trim();
    if (!text) {
      return;
    }
    if (text.length > this.maxLength) {
      this.inputError = `La pregunta no puede superar ${this.maxLength} caracteres.`;
      return;
    }

    this.advice.ask(text);
    this.question = '';
    this.inputError = '';
  }
}
