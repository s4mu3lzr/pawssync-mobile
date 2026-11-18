describe('Login', () => {
  it('signs in and navigates to the home tab', () => {
    cy.intercept('GET', '**/rest/v1/pets*', {
      statusCode: 200,
      body: [],
    }).as('loadPets');
    cy.intercept('POST', '**/auth/v1/token*', {
      statusCode: 200,
      body: {
        access_token: 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJjM2Y2NGU0Mi01YWMxLTQxZDItYWJhZS00MTI0MjU4YjJhMGQiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjo0MTAyNDQ0ODAwfQ.',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: 4102444800,
        refresh_token: 'cypress-test-refresh-token',
        user: {
          id: 'c3f64e42-5ac1-41d2-abae-4124258b2a0d',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'qa@example.com',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          identities: [],
          created_at: '2026-01-01T00:00:00.000Z',
        },
      },
    }).as('signIn');

    cy.visit('/login');

    cy.get('ion-input[formControlName="email"]')
      .shadow()
      .find('input')
      .type('qa@example.com');
    cy.get('ion-input[formControlName="password"]')
      .shadow()
      .find('input')
      .type('validPassword123');
    cy.contains('ion-button', 'Iniciar sesión').click();

    cy.wait('@signIn');
    cy.location('pathname').should('eq', '/tabs/home');
  });
});
