import { Component } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubblesOutline, homeOutline, home, walkOutline, walk, qrCodeOutline, qrCode } from 'ionicons/icons';

@Component({
  selector: 'app-main-tabs',
  standalone: true,
  templateUrl: './main-tabs.component.html',
  styleUrl: './main-tabs.component.scss',
  imports: [IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs],
})
export class MainTabsComponent {
  constructor() {
    addIcons({ homeOutline, home, walkOutline, walk, qrCodeOutline, qrCode, chatbubblesOutline });
  }
}
