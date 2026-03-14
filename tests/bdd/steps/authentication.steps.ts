import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

// Given steps
Given('la aplicación Jellysync está iniciada', async function(this: ICustomWorld) {
  const title = await this.page!.title();
  expect(title).toContain('Jellysync');
});

Given('el usuario tiene una URL de servidor Jellyfin válida', async function(this: ICustomWorld) {
  this.testData!.validUrl = 'https://jellyfin.example.com';
});

Given('el usuario tiene una API key válida', async function(this: ICustomWorld) {
  this.testData!.validApiKey = 'valid-api-key-123';
});

Given('el usuario tiene una URL de servidor inválida', async function(this: ICustomWorld) {
  this.testData!.invalidUrl = 'https://invalid-server.com';
});

Given('el usuario tiene una API key inválida', async function(this: ICustomWorld) {
  this.testData!.invalidApiKey = 'invalid-key';
});

Given('el usuario está en la pantalla de autenticación', async function(this: ICustomWorld) {
  await this.page!.waitForSelector('[data-testid="auth-screen"]');
});

Given('el usuario ha ingresado credenciales válidas', async function(this: ICustomWorld) {
  await this.page!.fill('[data-testid="server-url-input"]', 'https://jellyfin.example.com');
  await this.page!.fill('[data-testid="api-key-input"]', 'valid-api-key-123');
});

// When steps
When('el usuario ingresa la URL del servidor {string}', async function(this: ICustomWorld, url: string) {
  await this.page!.fill('[data-testid="server-url-input"]', url);
});

When('el usuario ingresa la API key {string}', async function(this: ICustomWorld, apiKey: string) {
  await this.page!.fill('[data-testid="api-key-input"]', apiKey);
});

When('el usuario hace click en el botón {string}', async function(this: ICustomWorld, buttonText: string) {
  const buttonMap: Record<string, string> = {
    'Conectar': '[data-testid="connect-button"]',
    'Sincronizar': '[data-testid="sync-button"]',
    'Cancelar': '[data-testid="cancel-button"]',
    'Reintentar': '[data-testid="retry-button"]',
  };
  const selector = buttonMap[buttonText] || `button:has-text("${buttonText}")`;
  await this.page!.click(selector);
});

When('el usuario deja el campo URL vacío', async function(this: ICustomWorld) {
  await this.page!.fill('[data-testid="server-url-input"]', '');
});

When('el usuario deja el campo API key vacío', async function(this: ICustomWorld) {
  await this.page!.fill('[data-testid="api-key-input"]', '');
});

When('el usuario marca la casilla {string}', async function(this: ICustomWorld, label: string) {
  await this.page!.check(`label:has-text("${label}") input[type="checkbox"]`);
});

// Then steps
Then('la aplicación debería conectarse exitosamente al servidor', async function(this: ICustomWorld) {
  await this.page!.waitForSelector('[data-testid="library-screen"]', { timeout: 10000 });
});

Then('debería mostrar la pantalla de biblioteca', async function(this: ICustomWorld) {
  const libraryScreen = this.page!.locator('[data-testid="library-screen"]');
  await expect(libraryScreen).toBeVisible();
});

Then('debería mostrar el mensaje {string}', async function(this: ICustomWorld, message: string) {
  const messageLocator = this.page!.locator(`text=${message}`);
  await expect(messageLocator).toBeVisible();
});

Then('la aplicación debería mostrar un mensaje de error', async function(this: ICustomWorld) {
  await this.page!.waitForSelector('[data-testid="error-message"]');
});

Then('el mensaje debería decir {string}', async function(this: ICustomWorld, errorMessage: string) {
  const errorElement = this.page!.locator('[data-testid="error-message"]');
  await expect(errorElement).toContainText(errorMessage);
});

Then('el botón {string} debería seguir habilitado', async function(this: ICustomWorld, buttonText: string) {
  const button = this.page!.locator(`button:has-text("${buttonText}")`);
  await expect(button).toBeEnabled();
});

Then('el botón {string} debería estar deshabilitado', async function(this: ICustomWorld, buttonText: string) {
  const button = this.page!.locator(`button:has-text("${buttonText}")`);
  await expect(button).toBeDisabled();
});

Then('debería mostrarse el mensaje de validación {string}', async function(this: ICustomWorld, validationMessage: string) {
  const validationElement = this.page!.locator(`text=${validationMessage}`);
  await expect(validationElement).toBeVisible();
});

Then('las credenciales deberían guardarse en el almacenamiento local', async function(this: ICustomWorld) {
  const savedUrl = await this.page!.evaluate(() => localStorage.getItem('jellyfinUrl'));
  expect(savedUrl).toBe('https://jellyfin.example.com');
});

Then('en la próxima apertura los campos deberían estar prellenados', async function(this: ICustomWorld) {
  await this.page!.reload();
  const urlInput = this.page!.locator('[data-testid="server-url-input"]');
  await expect(urlInput).toHaveValue('https://jellyfin.example.com');
});

// Regression test: User selector should show when /Users/Me fails
Given('el servidor Jellyfin no soporta /Users/Me con API keys', async function(this: ICustomWorld) {
  this.testData!.usersMeFails = true
})

Given('hay {int} usuarios en el servidor: {string}', async function(this: ICustomWorld, count: number, userList: string) {
  this.testData!.userCount = count
  this.testData!.userList = userList
})

Then('debería mostrar el selector de usuarios', async function(this: ICustomWorld) {
  await this.page!.waitForSelector('[data-testid="user-selector-screen"]', { timeout: 5000 })
})

Then('debería listar todos los usuarios disponibles', async function(this: ICustomWorld) {
  const userButtons = await this.page!.$$('[data-testid="user-option"]')
  expect(userButtons.length).toBeGreaterThan(0)
})

// Regression test: User can select from selector
Given('el selector de usuarios está visible', async function(this: ICustomWorld) {
  await this.page!.waitForSelector('[data-testid="user-selector-screen"]', { timeout: 5000 })
})

When('el usuario hace click en el usuario {string}', async function(this: ICustomWorld, userName: string) {
  await this.page!.click(`[data-user-name="${userName}"]`)
})

Then('debería mostrar la biblioteca de ese usuario', async function(this: ICustomWorld) {
  await this.page!.waitForSelector('[data-testid="library-content"]', { timeout: 5000 })
})

Then('debería guardar la selección del usuario', async function(this: ICustomWorld) {
  const userId = await this.page!.evaluate(() => localStorage.getItem('jellyfin_userId'))
  expect(userId).toBeTruthy()
})
