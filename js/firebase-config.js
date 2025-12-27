// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// CONFIGURACIÓN DE FIREBASE
const firebaseConfig = {
    apiKey: "AIzaSyB-IiFU_g1ZLTPt1_9h4ctFx9fgfAky1bk",
    authDomain: "mediconsult-pwa.firebaseapp.com",
    projectId: "mediconsult-pwa",
    storageBucket: "mediconsult-pwa.firebasestorage.app",
    messagingSenderId: "572003898944",
    appId: "1:572003898944:web:d5c606f7b2491a48cfb1a5",
    measurementId: "G-8XRT85SW4R",
    appId: "1:572003898944:web:d5c606f7b2491a48cfb1a5",
};

// Inicializamos la app y la base de datos
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
