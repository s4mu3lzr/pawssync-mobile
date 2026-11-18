import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-splash-screen',
  standalone: true,
  templateUrl: './splash-screen.component.html',
  styleUrl: './splash-screen.component.scss',
})
export class SplashScreenComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private redirectTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.redirectTimer = setTimeout(() => {
      void this.router.navigateByUrl('/home');
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.redirectTimer) {
      clearTimeout(this.redirectTimer);
    }
  }
}
