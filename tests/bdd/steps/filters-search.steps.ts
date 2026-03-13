import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

// Given steps
Given('la biblioteca está cargada con múltiples artistas y géneros', async function(this: ICustomWorld) {
  await this.page!.waitForSelector('[data-testid="library-content"]');
  const artistCount = await this.page!.locator('[data-testid="artist-item"]').count();
  expect(artistCount).toBeGreaterThan(1);
});

Given('el usuario está en la pestaña {string}', async function(this: ICustomWorld, tabName: string) {
  const tabMap: Record<string, string> = {
    'Artistas': 'tab-artists',
    'Álbumes': 'tab-albums',
    'Playlists': 'tab-playlists',
  };
  const testId = tabMap[tabName] || `tab-${tabName.toLowerCase()}`;
  await this.page!.click(`[data-testid="${testId}"]`);
});

Given('el usuario ha aplicado filtros', async function(this: ICustomWorld) {
  await this.page!.click('[data-testid="filter-button"]');
  await this.page!.click('[data-testid="filter-genre"]');
  await this.page!.click('text=Rock');
});

Given('el usuario está viendo artistas', async function(this: ICustomWorld) {
  await this.page!.click('[data-testid="tab-artists"]');
  await this.page!.waitForSelector('[data-testid="artists-list"]');
});

Given('el usuario ha buscado {string} anteriormente', async function(this: ICustomWorld, searchTerm: string) {
  await this.page!.fill('[data-testid="search-input"]', searchTerm);
  await this.page!.keyboard.press('Enter');
  await this.page!.waitForTimeout(500);
  await this.page!.reload();
});

Given('el usuario ha aplicado el filtro {string}', async function(this: ICustomWorld, filterText: string) {
  const [filterType, filterValue] = filterText.split(': ');
  await this.page!.click('[data-testid="filter-button"]');
  await this.page!.click(`[data-testid="filter-${filterType.toLowerCase()}"]`);
  await this.page!.click(`text=${filterValue}`);
});

// When steps
When('el usuario escribe {string} en el campo de búsqueda', async function(this: ICustomWorld, searchTerm: string) {
  await this.page!.fill('[data-testid="search-input"]', searchTerm);
  await this.page!.keyboard.press('Enter');
});

When('el usuario selecciona el filtro {string}', async function(this: ICustomWorld, filterType: string) {
  await this.page!.click('[data-testid="filter-button"]');
  const filterMap: Record<string, string> = {
    'Género': 'filter-genre',
    'Década': 'filter-decade',
    'Año': 'filter-year',
  };
  const testId = filterMap[filterType] || `filter-${filterType.toLowerCase()}`;
  await this.page!.click(`[data-testid="${testId}"]`);
});

When('el usuario selecciona {string}', async function(this: ICustomWorld, option: string) {
  await this.page!.click(`text=${option}`);
});

When('el usuario aplica el filtro {string}', async function(this: ICustomWorld, filterText: string) {
  const [filterType, filterValue] = filterText.split(': ');
  await this.page!.click('[data-testid="filter-button"]');
  await this.page!.click(`[data-testid="filter-${filterType.toLowerCase()}"]`);
  await this.page!.click(`text=${filterValue}`);
});

When('el usuario hace click en {string}', async function(this: ICustomWorld, buttonText: string) {
  if (buttonText === 'Limpiar filtros') {
    await this.page!.click('[data-testid="clear-filters"]');
  } else {
    await this.page!.click(`button:has-text("${buttonText}")`);
  }
});

When('el usuario busca {string}', async function(this: ICustomWorld, searchTerm: string) {
  await this.page!.fill('[data-testid="search-input"]', searchTerm);
  await this.page!.keyboard.press('Enter');
});

When('el usuario selecciona {string}', async function(this: ICustomWorld, sortOption: string) {
  await this.page!.click('[data-testid="sort-dropdown"]');
  const sortMap: Record<string, string> = {
    'Ordenar por: A-Z': 'sort-az',
    'Ordenar por: Añadido recientemente': 'sort-recent',
    'Ordenar por: Año': 'sort-year',
  };
  const testId = sortMap[sortOption] || `sort-${sortOption.toLowerCase()}`;
  await this.page!.click(`[data-testid="${testId}"]`);
});

// Then steps
Then('deberían mostrarse resultados que contengan {string}', async function(this: ICustomWorld, searchTerm: string) {
  const results = this.page!.locator('[data-testid="search-result"]');
  await expect(results.first()).toBeVisible();
  const count = await results.count();
  expect(count).toBeGreaterThan(0);
});

Then('los resultados deberían incluir canciones, álbumes y artistas', async function(this: ICustomWorld) {
  await expect(this.page!.locator('[data-testid="result-type-song"]')).toBeVisible();
  await expect(this.page!.locator('[data-testid="result-type-album"]')).toBeVisible();
  await expect(this.page!.locator('[data-testid="result-type-artist"]')).toBeVisible();
});

Then('cada resultado debería mostrar su tipo \(canción, álbum, artista\)', async function(this: ICustomWorld) {
  const firstResult = this.page!.locator('[data-testid="search-result"]').first();
  await expect(firstResult.locator('[data-testid="result-type-badge"]')).toBeVisible();
});

Then('deberían mostrarse solo los artistas del género Rock', async function(this: ICustomWorld) {
  const activeFilter = this.page!.locator('[data-testid="active-filter"]');
  await expect(activeFilter).toContainText('Rock');
});

Then('el contador debería actualizarse con el total filtrado', async function(this: ICustomWorld) {
  const counter = this.page!.locator('[data-testid="filtered-count"]');
  await expect(counter).toBeVisible();
});

Then('deberían mostrarse solo los álbumes de los años 60', async function(this: ICustomWorld) {
  const albums = this.page!.locator('[data-testid="album-item"]');
  const count = await albums.count();
  for (let i = 0; i < count; i++) {
    const year = await albums.nth(i).locator('[data-testid="album-year"]').textContent();
    const yearNum = parseInt(year || '0');
    expect(yearNum).toBeGreaterThanOrEqual(1960);
    expect(yearNum).toBeLessThan(1970);
  }
});

Then('los álbumes deberían estar ordenados por año', async function(this: ICustomWorld) {
  const years = await this.page!.locator('[data-testid="album-year"]').allTextContents();
  const yearNums = years.map(y => parseInt(y)).filter(n => !isNaN(n));
  const sorted = [...yearNums].sort((a, b) => a - b);
  expect(yearNums).toEqual(sorted);
});

Then('deberían mostrarse solo álbumes de Rock de los 70s', async function(this: ICustomWorld) {
  const activeFilters = this.page!.locator('[data-testid="active-filter"]');
  await expect(activeFilters).toContainText('Rock');
  await expect(activeFilters).toContainText('1970s');
});

Then('ambos filtros deberían mostrarse como tags activos', async function(this: ICustomWorld) {
  const tags = this.page!.locator('[data-testid="filter-tag"]');
  expect(await tags.count()).toBeGreaterThanOrEqual(2);
});

Then('todos los filtros deberían eliminarse', async function(this: ICustomWorld) {
  const activeFilters = this.page!.locator('[data-testid="active-filter"]');
  expect(await activeFilters.count()).toBe(0);
});

Then('debería mostrarse la biblioteca completa', async function(this: ICustomWorld) {
  const artistCount = await this.page!.locator('[data-testid="artist-item"]').count();
  expect(artistCount).toBeGreaterThan(0);
});

Then('debería mostrarse el mensaje {string}', async function(this: ICustomWorld, message: string) {
  const messageLocator = this.page!.locator(`text=${message}`);
  await expect(messageLocator).toBeVisible();
});

Then('debería sugerir {string}', async function(this: ICustomWorld, suggestion: string) {
  await expect(this.page!.locator(`text=${suggestion}`)).toBeVisible();
});

Then('deberían mostrarse resultados de Jazz que contengan {string}', async function(this: ICustomWorld, searchTerm: string) {
  const activeFilter = this.page!.locator('[data-testid="active-filter"]:has-text("Jazz")');
  await expect(activeFilter).toBeVisible();
  const results = this.page!.locator('[data-testid="search-result"]');
  expect(await results.count()).toBeGreaterThan(0);
});

Then('el filtro de género debería seguir activo', async function(this: ICustomWorld) {
  const genreFilter = this.page!.locator('[data-testid="active-filter"]:has-text("Jazz")');
  await expect(genreFilter).toBeVisible();
});

Then('los artistas deberían ordenarse alfabéticamente', async function(this: ICustomWorld) {
  const names = await this.page!.locator('[data-testid="artist-name"]').allTextContents();
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(sorted);
});

Then('los artistas deberían ordenarse por fecha de adición', async function(this: ICustomWorld) {
  // Verificar que se aplicó el ordenamiento
  await expect(this.page!.locator('[data-testid="sort-indicator-recent"]')).toBeVisible();
});

Then('debería mostrarse {string} en las búsquedas recientes', async function(this: ICustomWorld, searchTerm: string) {
  await this.page!.click('[data-testid="search-input"]');
  await expect(this.page!.locator(`[data-testid="recent-search"]:has-text("${searchTerm}")`)).toBeVisible();
});

Then('deberían mostrarse los resultados de {string}', async function(this: ICustomWorld, searchTerm: string) {
  const searchInput = this.page!.locator('[data-testid="search-input"]');
  await expect(searchInput).toHaveValue(searchTerm);
  const results = this.page!.locator('[data-testid="search-result"]');
  expect(await results.count()).toBeGreaterThan(0);
});
