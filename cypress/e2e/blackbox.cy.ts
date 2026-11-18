describe('Pruebas de caja negra - PawsSync V3.0', () => {
  describe('REQ-VAL-01: Registro y validaciones', () => {
    it('mantiene deshabilitado el envío vacío y muestra error para un correo inválido', () => {
      cy.visit('/register');

      // El formulario vacío no debe poder enviarse.
      cy.contains('ion-button', 'Crear cuenta').should('have.class', 'button-disabled');

      // Localiza el control nativo asociado al ion-input para escribir como usuario.
      cy.get('ion-input[formControlName="email"]')
        .find('input')
        .type('correo_falso')
        .blur();

      cy.contains('.field-error', 'Ingresa un correo válido.').should('be.visible');
      cy.contains('ion-button', 'Crear cuenta').should('have.class', 'button-disabled');
      cy.screenshot('REQ-VAL-01-registro-validaciones');
    });
  });

  describe('REQ-NAV-01: Protección de rutas', () => {
    it('redirige a login al acceder a una ruta privada sin sesión', () => {
      cy.visit('/tabs/home');

      cy.location('pathname').should('eq', '/login');
      cy.screenshot('REQ-NAV-01-proteccion-rutas');
    });
  });

  describe('REQ-NAV-02: Vista pública de extravío', () => {
    it('muestra el contacto y no presenta acciones de edición o guardado', () => {
      // Simula un perfil válido para que la prueba no dependa de datos reales.
      cy.intercept('POST', '**/rest/v1/rpc/get_public_pet_by_qr_token', {
        statusCode: 200,
        body: [
          {
            name: 'Luna de prueba',
            birth_date: null,
            photo_url: null,
            address: 'Dirección de prueba',
            contact_phone: '+5215550102030',
          },
        ],
      }).as('getPublicPet');

      cy.visit('/public/pet/TEST_QR_TOKEN');
      cy.wait('@getPublicPet');

      cy.contains('ion-button', 'Llamar al Dueño').should('be.visible');

      // Inspecciona el texto y las etiquetas accesibles de los botones del DOM.
      cy.get('button, ion-button')
        .filter((_, button) => {
          const label = button.getAttribute('aria-label') ?? '';
          const title = button.getAttribute('title') ?? '';
          const text = button.textContent ?? '';
          return /editar|guardar|edit|save/i.test(`${label} ${title} ${text}`);
        })
        .should('not.exist');
      cy.screenshot('REQ-NAV-02-vista-publica-solo-lectura');
    });
  });
});
