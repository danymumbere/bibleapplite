// Service Worker (caching offline)
const CACHE_NAME = 'bible-cache-v1';
const urlsToCache = [
  '/bible.json',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

const swCode = `
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open('${CACHE_NAME}').then(cache => {
      return cache.addAll(${JSON.stringify(urlsToCache)});
    })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
`;

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    const blob = new Blob([swCode], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    navigator.serviceWorker.register(url).then(reg => {
      console.log('Service Worker enregistré', reg);
    }).catch(err => {
      console.error('Échec de l’enregistrement du Service Worker', err);
    });
  }
}

// IndexedDB pour les notes
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('BibleAppLite', 1);
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e.target.error);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'key' });
      }
    };
  });
}

async function saveNote(key, text) {
  const db = await openDB();
  const tx = db.transaction('notes', 'readwrite');
  tx.objectStore('notes').put({ key, text });
  await new Promise(resolve => tx.oncomplete = resolve);
}

async function getNote(key) {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction('notes');
    const req = tx.objectStore('notes').get(key);
    req.onsuccess = () => resolve(req.result);
  });
}

// Plans de lecture simples (à compléter avec de nombreuses entrées)
const readingPlans = [
  { day: '2024-01-01', book: 'Jean', chapter: 1, verse: '1', text: 'Dans le commencement était la Parole, et la Parole était avec Dieu, et la Parole était Dieu.' },
  { day: '2024-01-02', book: 'Jean', chapter: 1, verse: '14', text: 'Et la Parole s’est fait chair et a habité parmi nous, plein de grâce et de vérité.' }
];

// État global
let currentBook = null;
let currentChapter = null;
let currentVerse = null;
let bibleData = null;
const verseElements = new Map();

// Éléments du DOM
const navHome = document.getElementById('nav-home');
const navBooks = document.getElementById('nav-books');
const navPlans = document.getElementById('nav-plans');
const navNotes = document.getElementById('nav-notes');
const navShare = document.getElementById('nav-share');

const bookList = document.getElementById('book-list');
const planList = document.getElementById('plan-list');
const notesContainer = document.getElementById('notes-container');

const audioPlayer = document.getElementById('audio-player');
const audioElem = audioPlayer.querySelector('audio');
const audioStatus = document.getElementById('audio-status');

const verseView = document.getElementById('verse-view');
const verseTitle = document.getElementById('verse-title');
const verseText = document.getElementById('verse-text');
const noteInput = document.getElementById('note-input');
const saveNoteBtn = document.getElementById('save-note');
const backToBooksBtn = document.getElementById('back-to-books');

const shareWhatsappBtn = document.getElementById('share-whatsapp');
const shareDiscordBtn = document.getElementById('share-discord');

// Affichage d'une vue
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.setAttribute('aria-hidden', 'true');
  });
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    target.setAttribute('aria-hidden', 'false');
  }
}

// Navigation
navHome.addEventListener('click', () => showView('home'));
navBooks.addEventListener('click', () => {
  loadBooks();
  showView('books');
});
navPlans.addEventListener('click', () => {
  loadPlans();
  showView('plans');
});
navNotes.addEventListener('click', () => {
  loadNotes();
  showView('notes');
});
navShare.addEventListener('click', () => showView('share'));

// Chargement de la liste des livres depuis bible.json
async function loadBooks() {
  try {
    let data = bibleData;
    if (!data) {
      const resp = await fetch('./bible.json');
      if (!resp.ok) throw new Error('Fichier Bible manquant');
      data = await resp.json();
      bibleData = data;
    }
    bookList.innerHTML = '';
    data.forEach(book => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = book.name;
      btn.setAttribute('aria-label', `Ouvrir ${book.name}`);
      btn.addEventListener('click', () => loadChapters(book));
      li.appendChild(btn);
      bookList.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    bookList.innerHTML = '<li>Impossible de charger la Bible. Vérifiez votre connexion ou le fichier bible.json.</li>';
  }
}

// Affichage des chapitres d'un livre
function loadChapters(book) {
  currentBook = book;
  showView('books');
  const sec = document.getElementById('books');
  sec.innerHTML = `<h2>${book.name}</h2><ul id="chapter-list"></ul>`;
  const chapterList = document.getElementById('chapter-list');
  for (let i = 1; i <= book.chapters; i++) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = `Chapitre ${i}`;
    btn.setAttribute('aria-label', `Chapitre ${i} de ${book.name}`);
    btn.addEventListener('click', () => loadVerses(book, i));
    li.appendChild(btn);
    chapterList.appendChild(li);
  }
}

// Affichage des versets d'un chapitre
function loadVerses(book, chapter) {
  currentBook = book;
  currentChapter = chapter;
  showView('verse-view');
  verseTitle.textContent = `${book.name} ${chapter}`;
  const chapters = bibleData.find(b => b.id