/* SANE - Conexión con el proyecto Firebase "SANEAppservis".
   Este es el único lugar donde se inicializa Firebase; app.js solo importa
   de aquí lo que necesita usar (auth, db y las funciones del SDK). */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjFKIWQPKbfuInAZPhtozgU7UvHtnjsGY",
  authDomain: "saneappservis.firebaseapp.com",
  projectId: "saneappservis",
  storageBucket: "saneappservis.firebasestorage.app",
  messagingSenderId: "508754371672",
  appId: "1:508754371672:web:1015d0114faa2f23cf162d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence);

export {
  auth,
  db,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  writeBatch
};
