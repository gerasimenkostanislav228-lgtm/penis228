// src/config/proxyManager.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Визначаємо __dirname для ES-модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Шлях до файлу проксі
const PROXIES_FILE = path.resolve(__dirname, 'proxies.json');

// Кешування та контроль змін файлу
let cache       = null;
let cacheMtime  = 0;

/**
 * Завантажити проксі зі свіжим кешем по mtime
 * @returns {Object} Об'єкт проксі { key: url }
 */
export function loadProxies() {
    const stat = fs.statSync(PROXIES_FILE);
    if (!cache || stat.mtimeMs !== cacheMtime) {
        cache      = JSON.parse(fs.readFileSync(PROXIES_FILE, 'utf-8'));
        cacheMtime = stat.mtimeMs;
    }
    return { ...cache };
}

/**
 * Зберегти проксі та оновити кеш
 * @param {Object} proxies Об'єкт проксі { key: url }
 */
export function saveProxies(proxies) {
    fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies, null, 2), 'utf-8');
    cache      = { ...proxies };
    cacheMtime = Date.now();
}

/**
 * Додати або оновити проксі за ключем
 * @param {string} key Назва проксі
 * @param {string} url URL проксі
 * @returns {Object} Оновлений об'єкт проксі
 */
export function addProxy(key, url) {
    const proxies = loadProxies();
    proxies[key]  = url;
    saveProxies(proxies);
    return { ...proxies };
}

/**
 * Видалити проксі за ключем
 * @param {string} key Назва проксі
 * @returns {Object} Оновлений об'єкт проксі
 */
export function removeProxy(key) {
    const proxies = loadProxies();
    if (proxies[key]) {
        delete proxies[key];
        saveProxies(proxies);
    }
    return { ...proxies };
}
